import build from "./config/esbuild.defaults.js"

// You can customize this as you wish, perhaps to add new esbuild plugins.
//
// ```
// import { copy } from 'esbuild-plugin-copy'
//
// const esbuildOptions = {
//   plugins: [
//     copy({
//       resolveFrom: 'cwd',
//       assets: {
//         from: ['./node_modules/somepackage/files/*')],
//         to: ['./output/_bridgetown/somepackage/files')],
//       },
//       verbose: false
//     }),
//   ]
// }
// ```
//
// You can also support custom base_path deployments via changing `publicPath`.
//
// ```
// const esbuildOptions = {
//   publicPath: "/my_subfolder/_bridgetown/static",
//   ...
// }
// ```

/**
 * @typedef { import("esbuild").BuildOptions } BuildOptions
 * @type {BuildOptions}
 */

const esbuildOptions = {
  entryPoints: ["./frontend/javascript/index.js", "./frontend/styles/index.sass"],
  plugins: [ ],
  // tried to use this to get CSS from the photoswipe package, but no luck.
  // for now I'm importing the photoswipe CSS in my sass
  // loader: { '.css': 'css' },
  globOptions: {
    excludeFilter: /\.(dsd|lit)\.css$/
  }
}

build(esbuildOptions)
