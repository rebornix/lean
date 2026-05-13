import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ["dist/**", "node_modules/**", "emulate/**", "emulator-fork/**", "eslint.config.mjs"],
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.lint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Mirror linear/linear's eslint rules, scaled to a single-package CLI.
      "@typescript-eslint/array-type": ["error", { default: "array" }],
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/dot-notation": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-misused-new": "error",
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/unified-signatures": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { vars: "all", args: "after-used", ignoreRestSiblings: true, argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-shadow": ["warn", { hoist: "all" }],
      "constructor-super": "error",
      curly: "error",
      "default-case": "error",
      eqeqeq: ["error", "always"],
      "no-caller": "error",
      "no-console": "off",
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-empty": "error",
      "no-eval": "error",
      "no-redeclare": "warn",
      "no-unused-vars": "off",
      "no-template-curly-in-string": "error",
      "no-undef-init": "warn",
      "no-var": "warn",
      "prefer-const": "warn",
    },
  }
);
