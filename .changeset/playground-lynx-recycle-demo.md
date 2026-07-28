---
---

Demo `/recycle` in the Lynx playground, and teach the DOM Element PAPI shim to drive a list's recycling callbacks.

A recycling list is the one place the engine calls the framework rather than the other way round, so a shim that ignored `componentAtIndex` and `enqueueComponent` rendered an empty box. It now drives the real protocol — including the `operationID` the engine correlates on — from a scroll listener, and implements `__UpdateListCallbacks` so a torn-down recycler stops being called. The windowing maths is the shim's own; the element count it produces is a real answer.
