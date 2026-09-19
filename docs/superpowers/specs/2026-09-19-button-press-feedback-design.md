# Button Press Feedback Design

**Status:** approved

## Goal

Every enabled native button in the collector and desk interfaces gives immediate
tactile visual feedback while a pointer or finger is held down.

## Design

Add one base-layer rule in `app/globals.css` for enabled `button` elements. The
pressed state moves the button down by one pixel, scales it to 98%, slightly
reduces brightness, and reduces its shadow. The existing MAC palette,
typography, button geometry, hover states, and component-specific styles remain
unchanged.

Disabled buttons do not move or change brightness. Users who request reduced
motion receive the state change without an animated transition.

## Scope

- Apply to native buttons across collector and desk screens.
- Do not apply to links or generic `[role="button"]` elements.
- Do not add a JavaScript ripple, sound, vibration, or persistent animation.
- Keep existing component-level `active:*` classes; the global rule supplies a
  consistent baseline where those classes are absent.

## Verification

- A focused static assertion checks the enabled-button selector, pressed
  transform, visual change, disabled exclusion, and reduced-motion override.
- Run lint, unit tests, browser tests, and the production build.
- Check representative collector and desk buttons in a browser at desktop and
  phone widths.
