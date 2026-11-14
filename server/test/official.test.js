import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isWhitelisted } from "../src/official.js";

const vectors = JSON.parse(readFileSync(new URL("./vectors/whitelist.json", import.meta.url), "utf8"));

for (const { hostname, expected } of vectors) {
  test(`isWhitelisted: ${hostname}`, () => {
    assert.equal(isWhitelisted(hostname), expected);
  });
}
