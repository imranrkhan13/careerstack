import test from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../src/app/page.js";

test("landing page renders a full HTML document", () => {
  const html = renderPage();
  assert.equal(typeof html, "string");
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<html[\s>]/);
  assert.match(html, /<\/html>/);
});

test("landing page has a top-level heading", () => {
  const html = renderPage();
  assert.match(html, /<h1[\s>]/);
});

test("landing page includes a call-to-action button", () => {
  const html = renderPage();
  assert.match(html, /class="btn"/);
  assert.match(html, /\/signup/);
});
