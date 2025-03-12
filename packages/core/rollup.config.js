import swc from '@rollup/plugin-swc';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'cjs',
    sourcemap: true,
  },
  external: [],
  plugins: [
    resolve({
      extensions: ['.js', '.ts'],
    }),
    commonjs(),
    swc({
      swc: {
        $schema: 'https://swc.rs/schema.json',
        sourceMaps: true,
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
            dynamicImport: true,
          },
          target: 'es2020',
          baseUrl: './src',
          minify: {
            compress: true,
            mangle: true,
          },
        },
        minify: true,
      },
    }),
    terser({
      compress: {
        passes: 4,
        drop_console: false,
        drop_debugger: true,
      },
      format: {
        comments: false,
      },
    }),
  ],
};
