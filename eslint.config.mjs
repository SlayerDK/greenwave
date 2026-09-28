import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    ".claude/**",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [".*"],
              message: "Use '@/' path aliases instead of relative imports",
            },
          ],
        },
      ],
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "src/lib/**/queries.ts",
      "src/lib/**/mutations.ts",
      "src/lib/**/data-access.ts",
      "src/lib/**/actions.ts",
      "src/lib/**/serialization.ts",
      "src/lib/**/service.ts",
      "src/lib/**/*-service.ts",
      "src/lib/auth/auth.ts",
      "src/app/**/_lib/**/queries.ts",
      "src/app/**/_lib/**/mutations.ts",
      "src/app/**/_lib/**/data-access.ts",
      "src/app/**/_lib/**/actions.ts",
      "src/app/**/_lib/**/serialization.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [".*"],
              message: "Use '@/' path aliases instead of relative imports",
            },
            {
              group: [
                "@/lib/*/queries",
                "@/lib/*/mutations",
                "@/lib/config/prisma",
                "@/app/**/_lib/**/queries",
                "@/app/**/_lib/**/mutations",
              ],
              message:
                "Import from data-access or actions instead. Direct query/mutation/prisma imports are restricted.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
