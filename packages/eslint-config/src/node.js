import tseslint from "typescript-eslint";
import baseConfig from "./base.js";

/** @type {import('typescript-eslint').Config} */
export default tseslint.config(...baseConfig, {
  languageOptions: {
    parserOptions: {
      projectService: true,
    },
  },
});
