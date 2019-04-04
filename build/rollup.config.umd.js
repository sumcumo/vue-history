import base from './rollup.config.base'

const config = Object.assign({}, base, {
  output: {
    file: 'dist/vue-history.umd.js',
    format: 'umd',
    name: 'VueHistory',
  },
})

export default config
