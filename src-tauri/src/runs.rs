//! In-memory run scheduler for chat streams, keyed by conversation.
//!
//! The backend is the source of truth for run state: a subscription start
//! claims the conversation's run slot (one reply per chat at a time — a
//! second send on the SAME chat is rejected instead of racing), and
//! `stopRun` aborts the provider request even when no chunk is flowing.
//!
//! Concurrency is bounded by a cap (settings `runs.maxConcurrent`, default
//! 2 — providers rate-limit): registrations beyond the cap are QUEUED and
//! start automatically in FIFO order as running drains. Entries are removed
//! by a drop guard in the pump task, so every exit path (done, error, drop,
//! cancel) frees the slot and promotes the next queued run.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

/// Listens for the stop signal of one run. The registry keeps the sender.
type CancelRx = tokio::sync::watch::Receiver<bool>;
type CancelTx = tokio::sync::watch::Sender<bool>;

/// Wakes a queued run when its turn arrives.
type TurnRx = tokio::sync::watch::Receiver<()>;
type TurnTx = tokio::sync::watch::Sender<()>;

#[derive(Debug)]
enum RunState {
    Running,
    Queued { turn_tx: TurnTx },
}

#[derive(Debug)]
struct RunEntry {
    cancel_tx: CancelTx,
    state: RunState,
}

#[derive(Default)]
pub struct RunRegistry {
    runs: Mutex<HashMap<i64, RunEntry>>,
    /// FIFO of conversations waiting for a slot (mirrors the Queued states).
    queue: Mutex<VecDeque<i64>>,
}

/// What the subscription's pump does with a claim.
pub enum RunClaim {
    /// Slot acquired — start the provider request immediately.
    Started(CancelRx),
    /// Over the concurrency cap — hold the subscription open until the turn
    /// signal fires, then start.
    Queued { cancel: CancelRx, turn: TurnRx },
}

impl RunRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Claims the conversation's run slot. `None` means a run is already in
    /// flight on this conversation (double-send guard — same chat only).
    /// `max_concurrent` caps simultaneously RUNNING streams; claims beyond
    /// it are queued FIFO.
    pub fn try_register(&self, conversation_id: i64, max_concurrent: usize) -> Option<RunClaim> {
        let mut runs = self.runs.lock().expect("run registry poisoned");
        if runs.contains_key(&conversation_id) {
            return None;
        }
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        let running = runs
            .values()
            .filter(|entry| matches!(entry.state, RunState::Running))
            .count();

        let claim = if running < max_concurrent {
            runs.insert(
                conversation_id,
                RunEntry {
                    cancel_tx,
                    state: RunState::Running,
                },
            );
            RunClaim::Started(cancel_rx)
        } else {
            let (turn_tx, turn_rx) = tokio::sync::watch::channel(());
            runs.insert(
                conversation_id,
                RunEntry {
                    cancel_tx,
                    state: RunState::Queued { turn_tx },
                },
            );
            self.queue
                .lock()
                .expect("run queue poisoned")
                .push_back(conversation_id);
            RunClaim::Queued {
                cancel: cancel_rx,
                turn: turn_rx,
            }
        };
        Some(claim)
    }

    /// Cancels the in-flight run for this conversation. `false` when no run
    /// is in flight (a stop press arrived late — harmless).
    pub fn cancel(&self, conversation_id: i64) -> bool {
        let runs = self.runs.lock().expect("run registry poisoned");
        match runs.get(&conversation_id) {
            Some(entry) => {
                // Mark the flag even if the listener was dropped — a send
                // with no receivers must not read as "nothing in flight".
                entry.cancel_tx.send_if_modified(|cancelled| {
                    if *cancelled {
                        false
                    } else {
                        *cancelled = true;
                        true
                    }
                });
                true
            }
            None => false,
        }
    }

    /// Releases the conversation's run slot and promotes the oldest queued
    /// run, if any (called by the pump-task guard).
    pub fn finish(&self, conversation_id: i64) {
        let mut runs = self.runs.lock().expect("run registry poisoned");
        if runs.remove(&conversation_id).is_none() {
            return;
        }
        let mut queue = self.queue.lock().expect("run queue poisoned");
        // Promote the oldest still-registered queued run; skip ids whose
        // entries vanished (defensive).
        while let Some(next) = queue.front().copied() {
            match runs.get_mut(&next) {
                Some(entry) => {
                    if let RunState::Queued { turn_tx } = &entry.state {
                        let _ = turn_tx.send(());
                        entry.state = RunState::Running;
                    }
                    queue.pop_front();
                    break;
                }
                None => {
                    queue.pop_front();
                }
            }
        }
    }
}

/// Resolves when the run is cancelled; race-free against a stop that lands
/// before the listener starts (the flag is checked before waiting). If the
/// registry entry vanishes uncancelled the run is no longer cancellable, so
/// the future parks forever rather than spuriously aborting it.
pub async fn cancelled(mut cancel: CancelRx) {
    loop {
        if *cancel.borrow_and_update() {
            return;
        }
        match cancel.changed().await {
            Ok(()) => continue,
            Err(_) => std::future::pending::<()>().await,
        }
    }
}

/// Resolves when a queued run's turn arrives (promotion sends the signal).
/// If the registry entry vanishes first (the run was cancelled while
/// queued), the cancel branch owns the exit — this future parks instead of
/// starting a dead run.
pub async fn turn_arrived(mut turn: TurnRx) {
    loop {
        match turn.changed().await {
            Ok(()) => return,
            Err(_) => std::future::pending::<()>().await,
        }
    }
}

/// Has this run been cancelled?
pub fn is_cancelled(cancel: &CancelRx) -> bool {
    *cancel.borrow()
}

/// Removes the registry entry when the pump task ends, whatever way it ends
/// (done, error, subscriber dropped, cancelled, panic) — and promotes the
/// next queued run.
pub fn finish_guard(registry: Arc<RunRegistry>, conversation_id: i64) -> impl Drop {
    FinishGuard {
        registry,
        conversation_id,
    }
}

struct FinishGuard {
    registry: Arc<RunRegistry>,
    conversation_id: i64,
}

impl Drop for FinishGuard {
    fn drop(&mut self) {
        self.registry.finish(self.conversation_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_register_on_the_same_conversation_is_rejected() {
        let registry = RunRegistry::new();
        let _rx1 = registry.try_register(1, 2).unwrap();
        assert!(registry.try_register(1, 2).is_none());
        let claim = registry.try_register(2, 2).unwrap();
        assert!(matches!(claim, RunClaim::Started(_)));
    }

    #[test]
    fn claims_beyond_the_cap_queue_in_fifo_order() {
        let registry = RunRegistry::new();
        assert!(matches!(
            registry.try_register(1, 2).unwrap(),
            RunClaim::Started(_)
        ));
        assert!(matches!(
            registry.try_register(2, 2).unwrap(),
            RunClaim::Started(_)
        ));
        assert!(matches!(
            registry.try_register(3, 2).unwrap(),
            RunClaim::Queued { .. }
        ));
        assert!(matches!(
            registry.try_register(4, 2).unwrap(),
            RunClaim::Queued { .. }
        ));

        // Finishing the first running run promotes conversation 3 (FIFO),
        // not 4.
        registry.finish(1);
        let entry = registry
            .runs
            .lock()
            .unwrap()
            .get(&3)
            .map(|e| matches!(e.state, RunState::Running))
            .unwrap();
        assert!(entry, "oldest queued run must be promoted");
        let still_queued = registry
            .runs
            .lock()
            .unwrap()
            .get(&4)
            .map(|e| matches!(e.state, RunState::Queued { .. }))
            .unwrap();
        assert!(still_queued);
    }

    #[test]
    fn cancel_reports_misses_and_marks_queued_runs() {
        let registry = RunRegistry::new();
        assert!(!registry.cancel(99), "nothing in flight");
        let _claim = registry.try_register(1, 1).unwrap();
        let queued = registry.try_register(2, 1).unwrap();
        let RunClaim::Queued { cancel, .. } = queued else {
            panic!("expected queued");
        };
        assert!(registry.cancel(2));
        assert!(is_cancelled(&cancel));
        assert!(registry.cancel(2), "a second stop press is idempotent");
    }

    #[test]
    fn finish_frees_the_slot() {
        let registry = RunRegistry::new();
        let _rx = registry.try_register(1, 1).unwrap();
        registry.finish(1);
        assert!(matches!(
            registry.try_register(1, 1).unwrap(),
            RunClaim::Started(_)
        ));
    }

    #[tokio::test]
    async fn turn_signal_wakes_the_queued_run() {
        let registry = Arc::new(RunRegistry::new());
        let _running = registry.try_register(1, 1).unwrap();
        let RunClaim::Queued { turn, .. } = registry.try_register(2, 1).unwrap() else {
            panic!("expected queued");
        };
        let waiter = tokio::spawn(async move { turn_arrived(turn).await });
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        registry.finish(1); // frees the slot, promotes 2
        tokio::time::timeout(std::time::Duration::from_secs(1), waiter)
            .await
            .expect("promotion must wake the queued run")
            .unwrap();
    }

    #[tokio::test]
    async fn cancelled_resolves_when_flag_set_before_listening() {
        let registry = RunRegistry::new();
        let rx = registry.try_register(1, 2).unwrap();
        let RunClaim::Started(rx) = rx else {
            panic!("expected started");
        };
        assert!(registry.cancel(1));
        tokio::time::timeout(std::time::Duration::from_secs(1), cancelled(rx))
            .await
            .expect("pre-cancel is observed");
    }

    #[tokio::test]
    async fn cancelled_resolves_when_flag_set_after_listening() {
        let registry = Arc::new(RunRegistry::new());
        let rx = registry.try_register(1, 2).unwrap();
        let RunClaim::Started(rx) = rx else {
            panic!("expected started");
        };
        let waiter = tokio::spawn(async move { cancelled(rx).await });
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        assert!(registry.cancel(1));
        tokio::time::timeout(std::time::Duration::from_secs(1), waiter)
            .await
            .expect("post-cancel is observed")
            .unwrap();
    }

    #[tokio::test]
    async fn cancelled_parks_when_sender_goes_away_uncancelled() {
        let registry = RunRegistry::new();
        let rx = registry.try_register(1, 2).unwrap();
        let RunClaim::Started(rx) = rx else {
            panic!("expected started");
        };
        registry.finish(1); // drops the sender, flag never set
        let waiter = tokio::spawn(async move { cancelled(rx).await });
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(!waiter.is_finished(), "must not wake on vanished sender");
        waiter.abort();
    }
}
