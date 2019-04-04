import base from './rollup.config.base'

const config = Object.assign({}, base, {
  output: {
    file: 'dist/vue-history.esm.js',
    format: 'es',
    name: 'VueHistory',
  },
})

export default config
