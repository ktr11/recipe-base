import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Amplify がデプロイ時に生成する CloudFormation テンプレートと
    // バンドル済み JS。人が書いたコードではないため検査対象にしない
    ".amplify/**",
  ]),
]);

export default eslintConfig;
