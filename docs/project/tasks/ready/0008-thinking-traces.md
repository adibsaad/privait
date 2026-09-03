---
id: 0008
title: Thinking traces (reasoning display + effort + round-trip)
---
## Goal
Implement visible reasoning for our actual stack: OpenAI-compatible providers first (OpenRouter, ollama, LM Studio, llama.cpp-server), then the native in-process llama.cpp binding. Stream each provider's reasoning trace into a separate expandable pane with elapsed timer, support effort controls where the provider allows, and normalize the fragmented reasoning fields behind one UI model. No Anthropic API in this task — no thinking blocks, no signatures.

## Acceptance criteria
- [ ] Thinking renders separately from the answer (expandable trace + timer), persisted per turn, rehydrated on reload
- [ ] Effort control where the provider supports it (OpenRouter `reasoning:{effort,max_tokens}`, ollama `think: low|medium|high`); hides or degrades gracefully where not
- [ ] Stream parsing covers the compat zoo: `delta.reasoning` ?? `delta.reasoning_content`, plus a `<think>`-tag fallback for providers that inline reasoning into content
- [ ] Provider normalizer maps every reasoning shape to one `ReasoningTrace` model; local traces are display-only and never sent back as authenticated content
- [ ] Capability flags on the provider abstraction (e.g. supportsReasoningStream, effortMapping) instead of hardcoded field names

## Constraints
- OpenAI-compat + local only. If a compat endpoint returns signature-like fields (e.g. OpenRouter serving a Claude model with `reasoning_details` signatures), pass them back verbatim and never synthesize or edit them — but do not build the Anthropic thinking-block protocol in this task
- Thinking costs context + money — surface usage honestly, don't hide it
