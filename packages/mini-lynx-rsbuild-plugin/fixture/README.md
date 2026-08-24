# fixture

The app `src/build.test.ts` builds. It is a directory rather than a string in
the test because rspack resolves a real module graph from a real path — the JSX
transform, the CSS pipeline and `@amritk/mini-lynx-native/background` all have
to be found the way an app's would be.

Not published: `package.json`'s `files` ships `dist` and `src`.
