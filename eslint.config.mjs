import tseslint from "typescript-eslint";

const boundaryForbidden = [
  { group: ["@nestjs/*", "nest*"], message: "CON-2: shared/domain-engine ห้าม import @nestjs/*" },
  { group: ["pg", "postgres", "mysql2", "kysely", "drizzle-orm", "drizzle-orm/*", "@drizzle-team/*"], message: "CON-2: shared/domain-engine ห้ามแตะ DB" },
  { group: ["node:http", "node:https", "node:http2", "undici", "axios", "got", "cross-fetch", "ky", "ofetch"], message: "CON-2: shared/domain-engine ห้ามแตะ HTTP" },
];

export default tseslint.config(
  { ignores: [".claude/", "node_modules/", "dist/", "tmp.md", "src/shared/domain-engine/__fixtures__/"] },
  {
    files: ["**/*.ts"],
    extends: tseslint.configs.strictTypeChecked,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    },
  },
  {
    files: ["src/shared/domain-engine/__fixtures__/**/*.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: false } },
  },
  {
    files: ["src/shared/domain-engine/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: boundaryForbidden }],
    },
  },
);
