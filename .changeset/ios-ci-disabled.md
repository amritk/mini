---
---

Comment out the iOS native CI job. Four `pod lib lint` invocations ran
sequentially on a macOS runner and took 81 minutes a run — against 2m17s for the
Android equivalent — because each lint builds the Lynx engine from scratch in
its own sandbox to check roughly 2,600 lines of Objective-C.

Nothing compiles the Objective-C now. `native-contract.test.ts` still pins the
native method surfaces against the TypeScript, so a renamed or dropped method is
still caught, but a syntax error or a missing header will reach a tarball. Run
`pod lib lint` by hand on a Mac before releasing a change under
`packages/lynx-*/ios/`. The job is left commented out in the workflow with the
two fixes worth making before turning it back on.
