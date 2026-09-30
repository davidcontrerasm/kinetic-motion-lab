"""Standalone Chapter 07–09 browser correctness suite.

Serve kinetic/ with `python -m http.server 8080`, then:
  python tests/e2e/layout_depth_craft.py --url http://localhost:8080/
Requires the project's existing Playwright Python environment. --browser may be
chromium, firefox or webkit. No timing speed ratios or compositor FPS assertions.

Selector contract for downstream integration:
* Every lesson study is [data-demo=<lesson id>][data-ready=true].
* Shared FLIP generates .tile/.tile__btn/.tile__bg in [data-flip-grid], and uses
  document-level [data-swatch-modal]; shared tilt consumes [data-tilt] .case__inner.
* Morph endpoints are [data-path][data-from][data-to]; [data-morph] owns progress.
* Leaderboard keys are [data-player], with numeric data-score and root data-order.
* Property study generates [data-tile] 0..149, .c-cost-shape/.c-cost-overlay;
  root data-stats is measured JSON, data-samples counts actual rAF intervals.
* Thrashing generates [data-row] 0..149; data-results is per-method real timings
  and widths, data-parity is awaiting-pair/true/false.
* The CPU experiment's data-blocks only increments inside the explicit block.
* Focus controls have stable cf-save/cf-undo/cf-note/cf-format IDs. [data-ring]
  is decorative, never focusable. Native Tab order is not simulated in tests.

Fonts are fulfilled with HTTP 200 empty CSS, never aborted. Application console
errors and unhandled rejections fail the suite. This file adds coverage; it does
not claim a run in any environment where the browser has not been launched.
"""
from __future__ import annotations

import argparse
import json
import math
from playwright.sync_api import sync_playwright, expect

GROUPS = {
    'layout': ['flip-debugger', 'flip-grid', 'height', 'view-transitions', 'morph', 'leaderboard'],
    'depth': ['elevation', 'card-flip', 'tilt', 'glass', 'spotlight', 'focus'],
    'craft': ['reduced', 'main-thread', 'property-cost', 'thrashing', 'focus-ring'],
}


def demo(page, key):
    return page.locator(f'[data-demo="{key}"]')


def ready(page, url, chapter):
    page.goto(f'{url.rstrip("/")}/guide/{chapter}.html')
    page.wait_for_function('(n) => document.querySelectorAll("[data-demo][data-ready=true]").length === n', arg=len(GROUPS[chapter]))
    page.add_style_tag(content='html { scroll-behavior: auto !important; }')
    assert page.locator('[data-lesson]').count() == len(GROUPS[chapter])
    assert page.locator('.lesson .callout--key').count() == len(GROUPS[chapter])
    assert page.locator('.lesson .callout--warn').count() == len(GROUPS[chapter])
    assert page.locator('.lesson details.snippet').count() == len(GROUPS[chapter])
    assert page.locator('.quiz__q').count() == 3
    assert page.locator('[data-chapter-nav] a').count() == 2
    ids = page.locator('[id]').evaluate_all('(els) => els.map(el => el.id)')
    assert len(ids) == len(set(ids))


def center(page, locator):
    locator.evaluate('el => el.scrollIntoView({block:"center", behavior:"instant"})')
    page.wait_for_timeout(100)


def value(locator, number):
    locator.evaluate('(el, value) => { el.value = value; el.dispatchEvent(new Event("input", {bubbles:true})); }', str(number))


def reduce(page, enabled):
    page.evaluate('(value) => import("../js/core/motion.js").then(({motion}) => motion.setReduced(value, {persist:false}))', enabled)


def settled(page, selector):
    page.wait_for_function('(selector) => document.querySelector(selector).getAnimations({subtree:true}).every(a => a.playState !== "running")', arg=selector)


def quiz(page):
    for question in page.locator('.quiz__q').all():
        question.locator('.quiz__opt').nth(int(question.get_attribute('data-answer'))).click()
    expect(page.locator('[data-quiz-result]')).to_contain_text('3 of 3')
    page.locator('[data-quiz-retry]').click()
    expect(page.locator('.quiz__q.is-answered')).to_have_count(0)
    page.locator('[data-complete]').click()
    expect(page.locator('[data-complete]')).to_have_attribute('aria-pressed', 'true')


def layout(page, url, reduced):
    ready(page, url, 'layout')
    d = demo(page, 'flip-debugger')
    center(page, d)
    d.locator('[data-phase="0"]').click()
    first = d.locator('[data-tile]').bounding_box()
    d.locator('[data-phase="1"]').click()
    last = d.locator('[data-tile]').bounding_box()
    assert last['width'] > first['width'] and last['y'] > first['y']
    d.locator('[data-phase="2"]').click()
    inverted = d.locator('[data-tile]').bounding_box()
    assert abs(inverted['x'] - first['x']) < 1 and abs(inverted['width'] - first['width']) < 1
    assert d.locator('[data-board]').get_attribute('data-destination') == 'true'
    value(d.locator('[data-scrub]'), 2.5)
    halfway = d.locator('[data-tile]').bounding_box()
    assert first['width'] < halfway['width'] < last['width']
    d.locator('[data-rerun]').click()
    d.locator('[data-reverse]').evaluate('el => el.click()')
    if not reduced:
        reduce(page, True)
        expect(d).to_have_attribute('data-phase', 'P')
        reduce(page, False)
    expect(d.locator('[data-geometry]')).to_contain_text('sx')

    s = demo(page, 'flip-grid')
    center(page, s.locator('[data-flip-filter]'))
    assert s.locator('.tile:not(.tile--ghost)').count() == 16
    s.locator('[data-flip-action=shuffle]').click()
    s.locator('[data-value=all]').focus()
    page.keyboard.press('ArrowRight')
    expect(s.locator('[data-value=warm]')).to_be_focused()
    expect(s.locator('.tile:not([hidden]):not(.tile--ghost)')).to_have_count(8)
    s.locator('[data-value=all]').click()
    s.locator('[data-flip-action=sort]').click()
    s.locator('[data-flip-action=sort]').click()
    s.locator('[data-flip-action=layout]').click()
    expect(s.locator('[data-flip-action=layout]')).to_have_attribute('aria-pressed', 'true')
    source = s.locator('.tile:not([hidden]):not(.tile--ghost) .tile__btn').nth(2)
    source.click()
    expect(page.locator('.modal__close')).to_be_focused()
    assert page.locator('[data-swatch-modal]').evaluate('el => !el.closest(".stage,figure")')
    page.keyboard.press('Escape')
    expect(page.locator('[data-swatch-modal]')).to_be_hidden()
    expect(source).to_be_focused()
    source.click()
    reduce(page, True)
    page.keyboard.press('Escape')
    expect(page.locator('[data-swatch-modal]')).to_be_hidden()
    if not reduced:
        reduce(page, False)

    h = demo(page, 'height')
    center(page, h)
    h.locator('[data-toggle-all]').click()
    expect(h.locator('[data-height-toggle][aria-expanded=true]')).to_have_count(4)
    page.wait_for_timeout(700)
    scale_sibling = h.locator('[data-method=scale] .l-sibling').bounding_box()['y']
    h.locator('[data-method=scale] [data-height-toggle]').click()
    page.wait_for_timeout(400)
    assert abs(h.locator('[data-method=scale] .l-sibling').bounding_box()['y'] - scale_sibling) < 1
    link = h.locator('[data-method=js] a')
    link.focus()
    page.keyboard.press('Escape')
    expect(h.locator('[data-method=js] [data-height-toggle]')).to_be_focused()
    assert h.locator('#lh-js').evaluate('el => el.inert')
    h.locator('[data-grow]').click()
    value(h.locator('[data-width]'), 65)
    h.locator('[data-method=js] [data-height-toggle]').click()
    h.locator('[data-method=js] [data-height-toggle]').evaluate('el => { el.click(); el.click(); }')
    page.wait_for_timeout(500)
    assert h.locator('#lh-js').evaluate('el => Math.abs(el.getBoundingClientRect().height - el.scrollHeight) < 2')
    h.locator('[data-reset]').click()
    expect(h.locator('[data-height-toggle][aria-expanded=false]')).to_have_count(4)

    album_checks(page, reduced)
    m = demo(page, 'morph')
    center(page, m)
    for key in ('play', 'menu', 'check', 'blob'):
        m.locator('[data-shape]').select_option(key)
        button = m.locator(f'[data-morph={key}]')
        path = button.locator('[data-path]')
        for endpoint in (0, 1):
            value(m.locator('[data-scrub]'), endpoint)
            expected = path.get_attribute('data-from' if endpoint == 0 else 'data-to')
            # Compare parser output, not whitespace serialization.
            assert path.evaluate(r'(el, expected) => el.getAttribute("d").replace(/\s/g, "") === expected.replace(/\s/g, "")', expected)
            expect(button).to_have_attribute('aria-pressed', str(bool(endpoint)).lower())
        button.click()
        m.locator('[data-replay]').click()
    reduce(page, True)
    assert all(float(v) in (0, 1) for v in m.locator('[data-morph]').evaluate_all('(els) => els.map(el => el.dataset.progress)'))
    if not reduced:
        reduce(page, False)

    board = demo(page, 'leaderboard')
    center(page, board)
    board.locator('[data-players]').evaluate('el => window.playerNodes = [...el.children]')
    for _ in range(3):
        board.locator('[data-round]').click()
    expect(board).to_have_attribute('data-round', '3')
    scores = board.locator('[data-player]').evaluate_all('(els) => els.map(el => +el.dataset.score)')
    assert scores == sorted(scores, reverse=True)
    assert board.get_attribute('data-order') != 'mira,leo,aya,noor,eli'
    assert board.locator('[data-player]').evaluate_all('(els) => els.every(el => window.playerNodes.includes(el))')
    reduce(page, True)
    board.locator('[data-reset]').click()
    expect(board).to_have_attribute('data-order', 'mira,leo,aya,noor,eli')
    assert board.locator('[data-score-value] .sr-only').all_text_contents() == ['100', '95', '90', '85', '80']
    if not reduced:
        reduce(page, False)
    quiz(page)


def album_checks(page, reduced):
    a = demo(page, 'view-transitions')
    center(page, a)
    for force in (True, False):
        a.locator('[data-force-fallback]').set_checked(force)
        for i in range(3):
            a.locator(f'[data-album="{i}"]').click()
            expect(a).to_have_attribute('data-state', 'detail')
            expect(a.locator('[data-back]')).to_be_focused()
            assert a.locator('[data-cover-slot] > [data-cover]').get_attribute('id') == f'l-cover-{i}'
            assert a.locator('[data-album-list]').evaluate('el => el.inert')
            a.locator('[data-back]').evaluate('el => el.click()')
            expect(a).to_have_attribute('data-state', 'grid')
            expect(a.locator(f'[data-album="{i}"]')).to_be_focused()
            assert not page.evaluate('document.documentElement.classList.contains("is-modal-open")')
        if not reduced:
            expected = 'fallback' if force or a.get_attribute('data-supported') == 'false' else 'native'
            expect(a).to_have_attribute('data-engine', expected)
    # Interrupt pending native callbacks, not just an already completed animation.
    a.evaluate('root => { const buttons = root.querySelectorAll("[data-album]"); buttons[0].click(); root.querySelector("[data-back]").click(); buttons[2].click(); }')
    expect(a).to_have_attribute('data-state', 'detail')
    expect(a).to_have_attribute('data-album', '2')
    a.locator('[data-force-fallback]').check()
    reduce(page, True)
    expect(a).to_have_attribute('data-engine', 'instant')
    page.wait_for_timeout(500)
    assert page.locator('#l-cover-2').count() == 1
    assert page.locator('#l-cover-2').evaluate('el => el.parentElement.hasAttribute("data-cover-slot")')
    page.keyboard.press('Escape')
    expect(a.locator('[data-album="2"]')).to_be_focused()
    assert a.locator('[data-album-detail]').evaluate('el => el.inert && el.hidden')
    if not reduced:
        reduce(page, False)


def depth(page, url, reduced):
    ready(page, url, 'depth')
    e = demo(page, 'elevation')
    center(page, e)
    e.locator('[data-elevation="4"]').click()
    value(e.locator('[data-height]'), 20)
    before = e.locator('[data-elevation="4"]').evaluate('el => el.style.boxShadow')
    value(e.locator('[data-angle]'), 150)
    assert e.locator('[data-elevation="4"]').evaluate('el => el.style.boxShadow') != before
    value(e.locator('[data-height]'), 0)
    assert e.locator('[data-elevation="4"]').evaluate('el => el.style.boxShadow') == 'none'

    c = demo(page, 'card-flip')
    center(page, c)
    value(c.locator('[data-perspective]'), 250)
    c.locator('[data-flip-card]').focus()
    page.keyboard.press('Space')
    expect(c).to_have_attribute('data-face', 'back')
    assert c.locator('[data-face=front]').evaluate('el => el.inert')
    assert not c.locator('[data-face=back]').evaluate('el => el.inert')
    c.locator('[data-axis]').select_option('x')
    c.locator('[data-face=back] a').focus()
    page.keyboard.press('Escape')
    expect(c.locator('[data-flip-card]')).to_be_focused()
    expect(c).to_have_attribute('data-face', 'front')
    c.locator('[data-flip-card]').click()
    reduce(page, True)
    assert c.locator('[data-rotor]').evaluate('el => getComputedStyle(el).transform') == 'none'
    if not reduced:
        reduce(page, False)

    t = demo(page, 'tilt')
    center(page, t)
    assert t.locator('[data-tilt] .case__inner').count() == 2
    assert t.locator('.case__layer').count() == 6
    for wrap in t.locator('.d-case-wrap').all():
        wrap.locator('[data-tilt-key=right]').focus()
        page.keyboard.press('ArrowRight')
        if not reduced:
            expect(wrap.locator('[data-tilt]')).to_have_attribute('data-pose', 'keyboard')
            expect(wrap.locator('[data-tilt-report]')).to_contain_text('Y 3°')
        wrap.locator('[data-tilt-key=reset]').click()
        expect(wrap.locator('[data-tilt]')).to_have_attribute('data-pose', 'neutral')
    card = t.locator('[data-tilt]').first
    center(page, card)
    box = card.bounding_box()
    page.mouse.move(box['x'] + box['width'] * .8, box['y'] + box['height'] * .2)
    if not reduced:
        page.wait_for_function('() => parseFloat(document.querySelector("[data-tilt]").style.getPropertyValue("--ry")) > 1')
    reduce(page, True)
    assert card.locator('.case__inner').evaluate('el => getComputedStyle(el).transform') == 'none'
    page.mouse.move(1, 1)
    if not reduced:
        reduce(page, False)

    g = demo(page, 'glass')
    center(page, g)
    value(g.locator('[data-blur]'), 30)
    value(g.locator('[data-saturation]'), 200)
    g.locator('[data-solid]').check()
    expect(g).to_have_attribute('data-material', 'solid')
    g.locator('[data-solid]').uncheck()
    expect(g).to_have_attribute('data-material', 'glass' if g.get_attribute('data-supported') == 'true' else 'solid')

    s = demo(page, 'spotlight')
    center(page, s)
    s.locator('[data-spot-plane]').focus()
    page.keyboard.press('ArrowRight')
    if not reduced and s.get_attribute('data-supported') == 'true':
        expect(s).to_have_attribute('data-x', '60.0')
        s.locator('[data-reveal-all]').click()
    expect(s).to_have_attribute('data-reveal', 'true')
    value(s.locator('[data-radius]'), 150)
    value(s.locator('[data-hardness]'), 100)
    expect(s).to_contain_text('This description is always readable.')

    f = demo(page, 'focus')
    center(page, f)
    for i, name in enumerate(('Map', 'Notes', 'People')):
        f.locator(f'[data-focus="{i}"]').focus()
        page.keyboard.press('Space')
        expect(f.locator(f'[data-focus="{i}"]')).to_have_attribute('aria-pressed', 'true')
        expect(f.locator('[data-focus-summary]')).to_contain_text(name)
        assert f.locator(f'[data-plane="{i}"]').evaluate('el => el.style.filter') == 'none'
    value(f.locator('[data-blur]'), 12)
    reduce(page, True)
    settled(page, '[data-demo=focus]')
    if not reduced:
        reduce(page, False)
    quiz(page)


def craft(page, url, reduced):
    ready(page, url, 'craft')
    r = demo(page, 'reduced')
    center(page, r)
    r.locator('[data-scenario]').select_option('route')
    r.locator('[data-replay]').click()
    assert len(set(r.locator('[data-message-title]').all_text_contents())) == 1
    r.locator('[data-local-reduced]').check()
    expect(r).to_have_attribute('data-reduced', 'true')
    r.locator('[data-ack]').last.click()
    assert r.locator('[data-ack]').all_text_contents() == ['Acknowledged ✓', 'Acknowledged ✓']
    reduce(page, True)
    r.locator('[data-local-reduced]').uncheck()
    expect(r).to_have_attribute('data-reduced', 'true')
    if not reduced:
        reduce(page, False)

    m = demo(page, 'main-thread')
    center(page, m)
    expect(m).to_have_attribute('data-blocks', '0')
    expect(m).to_have_attribute('data-running', 'false')
    m.locator('[data-start]').click()
    expect(m).to_have_attribute('data-running', 'false' if reduced else 'true')
    if not reduced:
        for lane in ('transform', 'left'):
            assert m.locator(f'[data-lane={lane}]').evaluate('el => getComputedStyle(el).animationPlayState') == 'running'
    m.locator('[data-block]').click()
    expect(m).to_have_attribute('data-block-state', 'complete', timeout=8000)
    assert float(m.get_attribute('data-block-ms')) >= 1900
    assert float(m.get_attribute('data-gap-ms')) > 0
    expect(m).to_have_attribute('data-blocks', '1')
    m.locator('[data-pause]').click()
    expect(m).to_have_attribute('data-running', 'false')
    if not reduced:
        for lane in ('transform', 'left'):
            assert m.locator(f'[data-lane={lane}]').evaluate('el => getComputedStyle(el).animationPlayState') == 'paused'
    m.locator('[data-replay]').click()
    page.evaluate('window.scrollTo({top:0, behavior:"instant"})')
    expect(m).to_have_attribute('data-running', 'false')
    m.locator('[data-reset]').click()
    expect(m).to_have_attribute('data-blocks', '0')

    p = demo(page, 'property-cost')
    center(page, p)
    assert p.locator('[data-tile]').count() == 150
    for prop in ('width', 'transform', 'shadow', 'opacity'):
        p.locator('[data-property]').select_option(prop)
        p.locator('[data-play]').click()
        expect(p).to_have_attribute('data-state', 'complete', timeout=6000)
        stats = json.loads(p.get_attribute('data-stats'))
        assert all(math.isfinite(stats[key]) and stats[key] >= 0 for key in ('mean', 'p95', 'longest', 'longGaps'))
        assert int(p.get_attribute('data-samples')) > 0
        assert stats['longest'] >= stats['p95']
        assert p.locator('[data-cost-grid]').evaluate('el => el.getAnimations({subtree:true}).length') == 0
    p.locator('[data-play]').click()
    p.locator('[data-property]').select_option('width')
    expect(p).to_have_attribute('data-state', 'stopped')
    p.locator('[data-active]').uncheck()
    p.locator('[data-reset]').click()
    expect(p).to_have_attribute('data-samples', '0')

    t = demo(page, 'thrashing')
    center(page, t)
    assert t.locator('[data-row]').count() == 150
    for mode in ('interleaved', 'batched'):
        t.locator(f'[data-run={mode}]').click()
        expect(t).to_have_attribute('data-state', 'complete', timeout=15000)
        result = json.loads(t.get_attribute('data-results'))[mode]
        assert len(result['times']) == 3
        assert all(math.isfinite(v) and v >= 0 for v in result['times'])
        assert result['widths'] == [120] * 150
        assert result['median'] == sorted(result['times'])[1]
    expect(t).to_have_attribute('data-parity', 'true')
    t.locator('[data-reset]').click()
    assert t.locator('[data-row]').evaluate_all('(els) => els.every(el => el.offsetWidth === 100)')

    f = demo(page, 'focus-ring')
    center(page, f)
    f.locator('#cf-save').focus()
    for ident in ('cf-undo', 'cf-note', 'cf-format'):
        page.keyboard.press('Tab')
        expect(f.locator(f'#{ident}')).to_be_focused()
        expect(f).to_have_attribute('data-focus', ident)
    assert f.locator('[data-ring]').evaluate('el => getComputedStyle(el).pointerEvents') == 'none'
    assert f.locator('#cf-format').evaluate('el => getComputedStyle(el).outlineStyle') != 'none'
    reduce(page, True)
    settled(page, '[data-demo=focus-ring]')
    page.evaluate('window.scrollBy({top:35, behavior:"instant"})')
    page.wait_for_timeout(80)
    ring, target = f.locator('[data-ring]').bounding_box(), f.locator('#cf-format').bounding_box()
    assert abs(ring['x'] - target['x']) < 1 and abs(ring['y'] - target['y']) < 1
    expect(f.locator('#cf-format')).to_be_focused()
    f.locator('#cf-note').fill('A local test')
    f.locator('#cf-save').click()
    expect(f.locator('[data-focus-status]')).to_contain_text('A local test')
    f.locator('#cf-undo').click()
    expect(f.locator('[data-focus-status]')).to_contain_text('undone')
    if not reduced:
        reduce(page, False)
    quiz(page)
    expect(page.locator('[data-chapter-nav] a').last).to_have_attribute('href', 'cheatsheet.html')


def live_preferences(page, url):
    # No persisted override: actual matchMedia changes flow through shared motion.
    for chapter in GROUPS:
        ready(page, url, chapter)
        if chapter == 'layout':
            d = demo(page, 'view-transitions')
            center(page, d)
            d.locator('[data-album="1"]').click()
        elif chapter == 'depth':
            d = demo(page, 'card-flip')
            center(page, d)
            d.locator('[data-flip-card]').click()
        else:
            d = demo(page, 'main-thread')
            center(page, d)
            d.locator('[data-start]').click()
        page.emulate_media(reduced_motion='reduce')
        expect(page.locator('html')).to_have_attribute('data-motion', 'reduced')
        if chapter == 'layout':
            expect(d).to_have_attribute('data-engine', 'instant')
            d.locator('[data-back]').click()
            expect(d.locator('[data-album="1"]')).to_be_focused()
        elif chapter == 'depth':
            assert d.locator('[data-rotor]').evaluate('el => getComputedStyle(el).transform') == 'none'
        else:
            expect(d).to_have_attribute('data-running', 'false')
            expect(d).to_have_attribute('data-blocks', '0')
        page.emulate_media(reduced_motion='no-preference')
        expect(page.locator('html')).to_have_attribute('data-motion', 'full')


def mobile(page, url):
    for chapter in GROUPS:
        ready(page, url, chapter)
        for key in GROUPS[chapter]:
            d = demo(page, key)
            center(page, d)
            assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), (chapter, key)
            assert d.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), key
        if chapter == 'layout':
            a = demo(page, 'view-transitions')
            a.locator('[data-force-fallback]').check()
            a.locator('[data-album="2"]').click()
            expect(a).to_have_attribute('data-state', 'detail')
            a.locator('[data-back]').click()
        if chapter == 'depth':
            s = demo(page, 'spotlight')
            center(page, s)
            s.locator('[data-spot-plane]').tap(position={'x': 35, 'y': 60})
            assert float(s.get_attribute('data-x')) < 50
        page.evaluate('window.scrollTo({top:0, behavior:"instant"})')
        page.locator('[data-menu-toggle]').click()
        expect(page.locator('[data-menu-toggle]')).to_have_attribute('aria-expanded', 'true')
        page.locator('[data-menu-toggle]').click()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:8080/')
    parser.add_argument('--browser', choices=['chromium', 'firefox', 'webkit'], default='chromium')
    args = parser.parse_args()
    errors = []
    with sync_playwright() as pw:
        browser = getattr(pw, args.browser).launch()
        def context(**options):
            ctx = browser.new_context(**options)
            ctx.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(status=200, content_type='text/css', body=''))
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            return ctx, page
        try:
            for reduced in (False, True):
                ctx, page = context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce' if reduced else 'no-preference')
                layout(page, args.url, reduced)
                depth(page, args.url, reduced)
                craft(page, args.url, reduced)
                ctx.close()
            ctx, page = context(viewport={'width': 1280, 'height': 900}, reduced_motion='no-preference')
            live_preferences(page, args.url)
            ctx.close()
            # Force true API absence, not only the UI fallback checkbox.
            ctx, page = context(viewport={'width': 1280, 'height': 900})
            ctx.add_init_script('Object.defineProperty(document, "startViewTransition", {value: undefined, configurable: true});')
            ready(page, args.url, 'layout')
            expect(demo(page, 'view-transitions')).to_have_attribute('data-supported', 'false')
            album_checks(page, False)
            ctx.close()
            # Force material feature-detection failures, while leaving other CSS support intact.
            ctx, page = context(viewport={'width': 1280, 'height': 900})
            ctx.add_init_script('const supports = CSS.supports.bind(CSS); CSS.supports = (...args) => /mask-image|backdrop-filter/.test(args.join(" ")) ? false : supports(...args);')
            ready(page, args.url, 'depth')
            expect(demo(page, 'glass')).to_have_attribute('data-material', 'solid')
            expect(demo(page, 'spotlight')).to_have_attribute('data-reveal', 'true')
            expect(demo(page, 'spotlight').locator('[data-mask-report]')).to_contain_text('unsupported')
            ctx.close()
            for width in (390, 320):
                ctx, page = context(viewport={'width': width, 'height': 844}, has_touch=True, reduced_motion='no-preference')
                mobile(page, args.url)
                ctx.close()
            ctx, page = context(viewport={'width': 320, 'height': 844}, java_script_enabled=False)
            for chapter, groups in GROUPS.items():
                page.goto(f'{args.url.rstrip("/")}/guide/{chapter}.html')
                assert page.locator('[data-lesson]').count() == len(groups)
                assert page.locator('.lesson__text p').count() >= len(groups) * 4
                assert page.locator('code[data-lang]').count() >= len(groups)
                assert page.locator('[data-chapter-nav] a').count() == 2
                assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
                assert page.locator('.modal:not([hidden])').count() == 0
            ctx.close()
            assert not errors, '\n'.join(errors)
            print('All 17 study groups, fallbacks, live preferences, finite instruments, mobile and no-JS checks completed.')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
