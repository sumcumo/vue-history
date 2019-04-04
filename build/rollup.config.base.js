import cjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'

export default {
  input: 'dist/esm/index.js',
  plugins: [
    resolve({
      jsnext: true,
      main: true,
      browser: true,
    }),
    cjs({
      exclude: 'src/**',
    }),
  ],
}
