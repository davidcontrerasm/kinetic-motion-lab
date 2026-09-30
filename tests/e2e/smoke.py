"""End-to-end smoke test for Kinetic, driven by Playwright (Chromium).

It loads the site, fails on any console error or uncaught exception, and
exercises every interactive component the way a person would: clicks, drags,
holds, keyboard input, filters, dialogs and the reduced-motion toggle. It also
checks a phone-sized viewport for horizontal overflow and a reduced-motion
session.

Usage:
    python tests/e2e/smoke.py [--url http://localhost:8080/] [--shots DIR]

Requires: pip install playwright && playwright install chromium
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


class Checks:
    def __init__(self) -> None:
        self.passed: list[str] = []
        self.failed: list[str] = []

    def check(self, name: str, condition: bool, detail: str = "") -> None:
        if condition:
            self.passed.append(name)
            print(f"  ok   {name}")
        else:
            self.failed.append(f"{name} {detail}".strip())
            print(f"  FAIL {name} {detail}")


def attach_error_capture(page: Page, errors: list[str]) -> None:
    page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))


def text(page: Page, selector: str) -> str:
    """DOM text of an element, independent of CSS text-transform (unlike inner_text)."""
    return (page.text_content(selector) or "").strip()


def scroll_to(page: Page, selector: str, block: str = "start") -> None:
    page.evaluate(
        """([sel, block]) => {
            document.documentElement.style.scrollBehavior = 'auto';
            document.querySelector(sel).scrollIntoView({ block });
        }""",
        [selector, block],
    )
    page.wait_for_timeout(900)


def shot(page: Page, shots: Path | None, name: str, full_page: bool = False) -> None:
    if shots:
        page.screenshot(path=str(shots / f"{name}.png"), full_page=full_page)


def desktop_suite(page: Page, url: str, shots: Path | None, c: Checks) -> None:
    page.goto(url)
    page.wait_for_selector("html.is-loaded", timeout=12000)
    c.check("intro completes and reveals the page", True)
    page.wait_for_timeout(1500)

    # Hero: variable-font proximity reacts to the pointer.
    box = page.locator("[data-hero-title]").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.2)
    page.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.25, steps=8)
    page.wait_for_timeout(700)
    varied = page.evaluate(
        """() => [...document.querySelectorAll('.hero .split-char')].some((el) => {
              const match = el.style.fontVariationSettings.match(/["']wght["']\\s+([\\d.]+)/);
              return match && Number(match[1]) > 500;
            })"""
    )
    c.check("hero letters swell near the cursor", varied)
    shot(page, shots, "01-hero")

    # Manifesto: words light up with scroll.
    page.evaluate(
        """() => { document.documentElement.style.scrollBehavior = 'auto';
                  const s = document.querySelector('[data-manifesto]');
                  window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * 0.5); }"""
    )
    page.wait_for_timeout(600)
    progress = int(page.inner_text("[data-manifesto-progress]"))
    c.check("manifesto progress tracks scroll", 30 <= progress <= 70, f"(got {progress}%)")
    shot(page, shots, "02-manifesto")

    # Easing editor.
    scroll_to(page, "#easing")
    scroll_to(page, "[data-bezier]", "center")
    page.click("[data-preset='snap']")
    page.wait_for_timeout(800)
    c.check("bezier preset morphs to snap", page.inner_text("[data-bezier-code]") == "cubic-bezier(0.9, 0, 0.1, 1)")
    handle = page.locator("[data-handle='0'] .bezier__knob").bounding_box()
    hx, hy = handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2
    page.mouse.move(hx, hy)
    page.mouse.down()
    page.mouse.move(hx - 60, hy - 80, steps=10)
    page.mouse.up()
    dragged = page.inner_text("[data-bezier-code]")
    c.check("bezier handle drags", dragged != "cubic-bezier(0.9, 0, 0.1, 1)", f"({dragged})")
    page.focus("[data-handle='1']")
    before = page.inner_text("[data-bezier-code]")
    page.keyboard.press("ArrowLeft")
    c.check("bezier handle responds to arrow keys", page.inner_text("[data-bezier-code]") != before)
    page.click("[data-preset='outBack']")
    page.wait_for_timeout(900)
    shot(page, shots, "03-easing")

    # Micro-interactions.
    scroll_to(page, "#interactions")
    scroll_to(page, "[data-demos]", "start")
    page.wait_for_timeout(600)

    hold = page.locator("[data-hold]")
    hb = hold.bounding_box()
    page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2)
    page.mouse.down()
    page.wait_for_timeout(500)
    page.mouse.up()
    page.wait_for_timeout(700)
    c.check("hold released early rewinds", "is-done" not in (hold.get_attribute("class") or ""))
    page.mouse.down()
    page.wait_for_timeout(1500)
    page.mouse.up()
    c.check("hold to confirm completes", "is-done" in (hold.get_attribute("class") or ""))

    page.click("[data-like]")
    page.wait_for_timeout(200)
    c.check("like toggles pressed state", page.get_attribute("[data-like]", "aria-pressed") == "true")
    c.check("like counter rolls to 1,285", page.inner_text("[data-like-count] .sr-only") == "1,285")

    page.click("[data-switch]")
    c.check("switch turns night on", page.get_attribute("[data-switch]", "aria-checked") == "true")

    page.click("[data-send]")
    c.check("submit enters loading", page.get_attribute("[data-send]", "data-state") == "loading")
    page.wait_for_timeout(2100)
    c.check("submit reaches success", page.get_attribute("[data-send]", "data-state") == "success")

    checks = page.locator("[data-demo='checklist'] .check")
    checks.nth(1).click()
    checks.nth(2).click()
    c.check("checklist completes", text(page, "[data-checklist-status]") == "All done. Ship it.")

    page.fill("#demo-email", "not-an-email")
    page.click("[data-field] button[type=submit]")
    c.check("invalid email shows error", page.get_attribute("[data-field]", "data-state") == "error")
    page.fill("#demo-email", "ada@example.com")
    c.check("valid email recovers live", page.get_attribute("[data-field]", "data-state") == "valid")

    page.click("#demo-tab-2")
    page.keyboard.press("ArrowRight")
    c.check("tabs select via click and arrows", page.get_attribute("#demo-tab-3", "aria-selected") == "true")

    stars = page.locator("[data-demo='rating'] .star")
    stars.nth(4).click()
    page.wait_for_timeout(600)
    c.check("rating 5 sets its label", page.inner_text("[data-rating-label]") == "Absolutely loved it")
    stars.nth(0).click()
    page.wait_for_timeout(40)
    stars.nth(4).click()
    page.wait_for_timeout(700)
    c.check(
        "rapid rating reversal keeps label consistent",
        page.inner_text("[data-rating-label]") == "Absolutely loved it",
        f"(got {page.inner_text('[data-rating-label]')!r})",
    )

    page.click("[data-step='1']")
    page.wait_for_timeout(100)
    c.check("stepper increments", page.inner_text("[data-stepper-value] .sr-only") == "09")
    page.click("[data-step='-1']")
    page.click("[data-step='-1']")
    page.wait_for_timeout(100)
    c.check("stepper decrements", page.inner_text("[data-stepper-value] .sr-only") == "07")

    page.click("[data-copy-btn]")
    page.wait_for_timeout(150)
    c.check("copy shows confirmation", "is-copied" in (page.get_attribute("[data-copy-btn]", "class") or ""))

    page.focus("[data-pendulum] input")
    for _ in range(5):
        page.keyboard.press("ArrowRight")
    c.check("pendulum slider updates bubble", page.inner_text("[data-bubble-value]") == "45")

    for _ in range(4):
        page.click("[data-bell]")
        page.wait_for_timeout(120)
    c.check("bell badge counts notifications", page.inner_text("[data-bell-badge]") == "4")
    overflow = page.locator(".toast.is-overflow").count()
    c.check("toast stack caps visible items", overflow == 1, f"(overflow={overflow})")
    page.hover("[data-toasts]")
    page.wait_for_timeout(500)
    page.locator(".toast:not(.is-leaving) .toast__close").first.click()
    page.wait_for_timeout(500)
    c.check("dismissing a toast updates the badge", page.inner_text("[data-bell-badge]") == "3")
    page.mouse.move(5, 5)
    shot(page, shots, "04-interactions")

    # Physics lab.
    scroll_to(page, "#physics")
    scroll_to(page, "[data-spring-lab]", "center")
    page.click("[data-spring-preset='stiff']")
    c.check("spring preset updates sliders", page.input_value("[data-param='stiffness']") == "210")
    canvas = page.locator("[data-spring-canvas]").bounding_box()
    cx, cy = canvas["x"] + canvas["width"] / 2, canvas["y"] + canvas["height"] * 0.56
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 160, cy + 60, steps=6)
    page.mouse.up()
    page.wait_for_timeout(250)
    page.fill("[data-param='damping']", "60")
    page.dispatch_event("[data-param='damping']", "input")
    c.check("damping change reclassifies regime", text(page, "[data-readout-regime]") == "Overdamped")
    shot(page, shots, "05-physics")

    # Principles gallery: vertical scroll moves the track horizontally.
    page.evaluate(
        """() => { document.documentElement.style.scrollBehavior = 'auto';
                  const s = document.querySelector('[data-gallery]');
                  window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * 0.6); }"""
    )
    page.wait_for_timeout(900)
    translated = page.evaluate("() => new DOMMatrix(getComputedStyle(document.querySelector('[data-gallery-track]')).transform).m41")
    c.check("gallery track travels horizontally", translated < -200, f"(x={translated:.0f})")
    shot(page, shots, "06-principles")

    # FLIP layout.
    scroll_to(page, "#layout")
    scroll_to(page, "[data-flip]", "start")
    page.click("[data-flip-action='shuffle']")
    page.wait_for_timeout(300)
    page.click("[data-flip-filter] [data-value='warm']")
    page.wait_for_timeout(900)
    visible = page.locator("[data-flip-grid] .tile:not([hidden]):not(.tile--ghost)").count()
    c.check("warm filter shows 8 swatches", visible == 8, f"(got {visible})")
    page.click("[data-flip-filter] [data-value='all']")
    page.wait_for_timeout(900)
    page.click("[data-flip-action='layout']")
    page.wait_for_timeout(900)
    c.check("list view toggles", "is-list" in (page.get_attribute("[data-flip-grid]", "class") or ""))
    shot(page, shots, "07-layout-list")
    page.click("[data-flip-action='layout']")
    page.wait_for_timeout(900)

    page.locator("[data-flip-grid] .tile__btn").first.click()
    page.wait_for_timeout(100)
    page.keyboard.press("Escape")  # interrupt the opening transition
    page.wait_for_timeout(900)
    c.check("dialog closes when interrupted mid-open", page.is_hidden("[data-swatch-modal]"))
    page.locator("[data-flip-grid] .tile__btn").nth(2).click()
    page.wait_for_timeout(1000)
    c.check("dialog opens with focus on close", page.evaluate("() => document.activeElement.matches('.modal__close')"))
    shot(page, shots, "08-layout-dialog")
    page.keyboard.press("Escape")
    page.wait_for_timeout(900)
    c.check("dialog closes and restores scroll", page.is_hidden("[data-swatch-modal]") and not page.evaluate("() => document.documentElement.classList.contains('is-modal-open')"))

    # Depth.
    scroll_to(page, "#depth")
    scroll_to(page, ".cases", "center")
    card = page.locator("[data-tilt]").first.bounding_box()
    page.mouse.move(card["x"] + card["width"] * 0.8, card["y"] + card["height"] * 0.2, steps=6)
    page.wait_for_timeout(600)
    ry = page.evaluate("() => parseFloat(document.querySelector('[data-tilt]').style.getPropertyValue('--ry'))")
    c.check("tilt card rotates toward pointer", ry > 2, f"(ry={ry})")
    shot(page, shots, "09-depth")

    # Footer.
    scroll_to(page, "#contact")
    title = page.locator("[data-jelly]").bounding_box()
    page.mouse.move(title["x"] + 20, title["y"] + title["height"] * 0.2)
    page.mouse.move(title["x"] + title["width"] * 0.6, title["y"] + title["height"] * 0.8, steps=6)
    page.wait_for_timeout(120)
    wobbling = page.evaluate("() => [...document.querySelectorAll('[data-jelly] .split-char')].some(el => el.style.transform)")
    c.check("footer letters wobble", wobbling)
    shot(page, shots, "10-footer")

    # Reduced-motion toggle via keyboard shortcut.
    page.mouse.move(5, 5)
    page.keyboard.press("m")
    c.check("M toggles reduced motion", page.get_attribute("html", "data-motion") == "reduced")
    page.keyboard.press("m")
    c.check("M restores full motion", page.get_attribute("html", "data-motion") == "full")

    # Replay intro.
    page.click("[data-replay]")
    page.wait_for_timeout(300)
    c.check("replay shows the intro again", page.is_visible("[data-preloader]"))
    page.wait_for_selector("html.is-loaded", timeout=8000)
    page.wait_for_timeout(1600)
    c.check("replay returns to the top", page.evaluate("() => window.scrollY") < 5)


def mobile_suite(page: Page, url: str, shots: Path | None, c: Checks) -> None:
    page.goto(url)
    page.wait_for_selector("html.is-loaded", timeout=12000)
    page.wait_for_timeout(1500)
    shot(page, shots, "11-mobile-hero")
    overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    c.check("mobile has no horizontal overflow", overflow <= 0, f"(overflow={overflow}px)")
    page.click("[data-menu-toggle]")
    page.wait_for_timeout(1100)
    c.check("mobile menu opens", page.is_visible("[data-menu]"))
    shot(page, shots, "12-mobile-menu")
    page.click("[data-menu] a[href='#layout']")
    page.wait_for_timeout(1500)
    c.check("mobile menu link closes menu", page.get_attribute("[data-menu-toggle]", "aria-expanded") == "false")
    scroll_to(page, "[data-flip]", "start")
    shot(page, shots, "13-mobile-layout")
    scroll_to(page, "[data-demos]", "start")
    shot(page, shots, "14-mobile-demos")


def reduced_suite(page: Page, url: str, c: Checks) -> None:
    page.goto(url)
    page.wait_for_selector("html.is-loaded", timeout=8000)
    c.check("reduced-motion session loads", page.get_attribute("html", "data-motion") == "reduced")
    scroll_to(page, "[data-demos]", "start")
    page.click("[data-like]")
    c.check("interactions still work under reduced motion", page.inner_text("[data-like-count] .sr-only") == "1,285")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://localhost:8080/")
    parser.add_argument("--shots", default=None, help="directory for screenshots (optional)")
    args = parser.parse_args()
    shots = Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)

    c = Checks()
    errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            print("desktop 1440x900")
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
            page = ctx.new_page()
            attach_error_capture(page, errors)
            desktop_suite(page, args.url, shots, c)
            ctx.close()

            print("mobile 390x844")
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
            page = ctx.new_page()
            attach_error_capture(page, errors)
            mobile_suite(page, args.url, shots, c)
            ctx.close()

            print("reduced motion")
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
            page = ctx.new_page()
            attach_error_capture(page, errors)
            reduced_suite(page, args.url, c)
            ctx.close()
        finally:
            browser.close()

    c.check("no console errors or uncaught exceptions", not errors, "\n    " + "\n    ".join(errors))
    print(f"\n{len(c.passed)} passed, {len(c.failed)} failed")
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())
