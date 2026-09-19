# Button Press Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every enabled native button immediate tactile visual feedback while it is pressed.

**Architecture:** Add a global pressed state in the existing base layer of `app/globals.css`, so collector and desk buttons inherit one consistent effect without per-component edits. A focused Node test reads the stylesheet and protects the selector, transform, disabled exclusion, and reduced-motion behavior.

**Tech Stack:** CSS, Tailwind CSS layers, Node.js test runner

## Global Constraints

- Preserve the MAC palette, Geist typography, existing button geometry, hover states, and component-specific styles.
- Apply only to enabled native `button` elements, not links or generic `[role="button"]` elements.
- Do not add JavaScript, sound, vibration, ripples, or persistent animation.
- Disabled buttons must not receive the pressed effect.
- Reduced-motion users must receive the state change without an animated transition.

---

### Task 1: Add global tactile button feedback

**Files:**
- Create: `app/globals.test.mjs`
- Modify: `app/globals.css:123-141`
- Modify: `package.json` (`test:unit`)

**Interfaces:**
- Consumes: Native HTML `button` pressed and disabled states.
- Produces: A global `button:not(:disabled):active` visual state and reduced-motion override.

- [ ] **Step 1: Write the failing stylesheet contract test**

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("global button press feedback", () => {
  it("gives enabled native buttons a tactile pressed state", () => {
    assert.match(css, /button:not\(:disabled\):active\s*\{[^}]*translateY\(1px\)[^}]*scale\(0\.98\)/s);
    assert.match(css, /button:not\(:disabled\):active\s*\{[^}]*filter:\s*brightness\(0\.92\)/s);
  });

  it("keeps disabled buttons still and honors reduced motion", () => {
    assert.doesNotMatch(css, /button:active\s*\{/);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[\s\S]*button:not\(:disabled\)[^{]*\{[^}]*transition-duration:\s*0ms/s);
  });
});
```

- [ ] **Step 2: Register and run the focused test to verify it fails**

Add `app/globals.test.mjs` to the explicit `test:unit` Node test list in `package.json`.

Run:

```bash
node --test app/globals.test.mjs
```

Expected: FAIL because `button:not(:disabled):active` is absent.

- [ ] **Step 3: Add the minimal base-layer CSS**

Inside `@layer base` in `app/globals.css`, after the existing touch-action rule:

```css
  button:not(:disabled) {
    transition-property: transform, filter, box-shadow;
    transition-duration: 120ms;
    transition-timing-function: ease-out;
  }

  button:not(:disabled):active {
    transform: translateY(1px) scale(0.98);
    filter: brightness(0.92);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.18);
  }

  @media (prefers-reduced-motion: reduce) {
    button:not(:disabled) {
      transition-duration: 0ms;
    }
  }
```

- [ ] **Step 4: Run focused and repository verification**

Run:

```bash
node --test app/globals.test.mjs
npm run lint
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 5: Verify representative UI states**

Open collector and desk screens at desktop and phone widths. Press a large primary action and a small text action. Confirm:

- the button visibly depresses only while held;
- release restores its original geometry;
- disabled buttons do not move;
- existing MAC colors and typography remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/globals.test.mjs package.json
git commit -m "feat: add tactile button feedback"
```
