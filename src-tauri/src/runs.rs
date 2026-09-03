//! In-memory registry of in-flight chat runs, keyed by conversation.
//!
//! The backend is the source of truth for run state: a subscription start
//! claims the conversation's run slot, a second send on the same chat is
//! rejected instead of racing the first, and `stopRun` aborts the provider
//! request even when no chunk is flowing. Entries are removed by a drop
//! guard in the pump task, so every exit path (done, error, drop, cancel)
//! frees the slot.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Listens for the stop signal of one run. The registry keeps the sender.
type CancelRx = tokio::sync::watch::Receiver<bool>;
type CancelTx = tokio::sync::watch::Sender<bool>;

#[derive(Default)]
pub struct RunRegistry {
    runs: Mutex<HashMap<i64, CancelTx>>,
}

impl RunRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Claims the conversation's run slot, returning a listener for the stop
    /// signal. `None` means a run is already in flight on this conversation.
    pub fn try_register(&self, conversation_id: i64) -> Option<CancelRx> {
        let mut runs = self.runs.lock().expect("run registry poisoned");
        if runs.contains_key(&conversation_id) {
            return None;
        }
        let (tx, rx) = tokio::sync::watch::channel(false);
        runs.insert(conversation_id, tx);
        Some(rx)
    }

    /// Cancels the in-flight run for this conversation. `false` when no run
    /// is in flight (a stop press arrived late — harmless).
    pub fn cancel(&self, conversation_id: i64) -> bool {
        let runs = self.runs.lock().expect("run registry poisoned");
        match runs.get(&conversation_id) {
            Some(tx) => {
                // Mark the flag even if the listener was dropped — a send
                // with no receivers must not read as "nothing in flight".
                tx.send_if_modified(|cancelled| {
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

    /// Releases the conversation's run slot (called by the pump-task guard).
    pub fn finish(&self, conversation_id: i64) {
        self.runs
            .lock()
            .expect("run registry poisoned")
            .remove(&conversation_id);
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

/// Has this run been cancelled?
pub fn is_cancelled(cancel: &CancelRx) -> bool {
    *cancel.borrow()
}

/// Removes the registry entry when the pump task ends, whatever way it ends
/// (done, error, subscriber dropped, cancelled, panic).
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
        let _rx1 = registry.try_register(1).unwrap();
        assert!(registry.try_register(1).is_none());
        let _rx2 = registry.try_register(2).unwrap();
        assert!(registry.try_register(2).is_none());
        assert!(registry.cancel(1), "fresh entry is cancellable");
        assert!(registry.cancel(1), "a second stop press is idempotent");
    }

    #[test]
    fn finish_frees_the_slot() {
        let registry = RunRegistry::new();
        assert!(registry.try_register(1).is_some());
        registry.finish(1);
        assert!(registry.try_register(1).is_some());
    }

    #[test]
    fn cancel_reports_misses() {
        let registry = RunRegistry::new();
        assert!(!registry.cancel(99), "nothing in flight");
    }

    #[tokio::test]
    async fn cancelled_resolves_when_flag_set_before_listening() {
        let registry = RunRegistry::new();
        let rx = registry.try_register(1).unwrap();
        assert!(registry.cancel(1));
        tokio::time::timeout(std::time::Duration::from_secs(1), cancelled(rx))
            .await
            .expect("pre-cancel is observed");
    }

    #[tokio::test]
    async fn cancelled_resolves_when_flag_set_after_listening() {
        let registry = Arc::new(RunRegistry::new());
        let rx = registry.try_register(1).unwrap();
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
        let rx = registry.try_register(1).unwrap();
        registry.finish(1); // drops the sender, flag never set
        let waiter = tokio::spawn(async move { cancelled(rx).await });
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(!waiter.is_finished(), "must not wake on vanished sender");
        waiter.abort();
    }
}
