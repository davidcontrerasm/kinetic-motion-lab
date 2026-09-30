"""Chapter 03/04 browser checks using the existing Python Playwright install.

Serve kinetic/ with `python -m http.server 8080`, then run:
    python tests/e2e/feedback_springs.py --url http://localhost:8080/
No test server, API, package additions or external assets are required. Font
requests are blocked for repeatable offline checks. Assertions fail the process.
"""
from __future__ import annotations

import argparse
import json
from playwright.sync_api import sync_playwright, expect


def card(page, key):
    return page.locator(f'[data-demo="{key}"]')


def ready(page, url, chapter, count):
    page.goto(f'{url.rstrip("/")}/guide/{chapter}.html')
    page.wait_for_function('(n) => document.querySelectorAll("[data-demo][data-ready=true]").length === n', arg=count)
    page.add_style_tag(content='html { scroll-behavior: auto !important; }')
    assert page.locator('[data-quiz] .quiz__q').count() == 3
    assert page.locator('[data-chapter-nav] a').count() == 2
    ids = page.locator('[id]').evaluate_all('(els) => els.map(el => el.id)')
    assert len(ids) == len(set(ids)), 'duplicate IDs'


def drag(page, locator, dx, dy, cancel=False):
    locator.scroll_into_view_if_needed()
    b = locator.bounding_box()
    x, y = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=12)
    if cancel:
        page.keyboard.press('Escape')
    page.mouse.up()


def feedback(page, url, reduced=False):
    ready(page, url, 'feedback', 14)
    assert page.locator('[data-lesson]').count() == 5
    assert page.locator('[data-demo] [data-notes]').count() == 14
    p = card(page, 'password')
    p.locator('input').fill('Invented!12345')
    expect(p.locator('meter')).to_have_js_property('value', 4)
    p.locator('[data-show]').click()
    expect(p.locator('input')).to_have_attribute('type', 'text')
    p.locator('[data-reset]').click()
    expect(p.locator('input')).to_have_value('')

    o = card(page, 'otp')
    cells = o.locator('[data-cells] input')
    cells.nth(0).fill('000000')
    o.locator('[data-check]').click()
    expect(o).to_have_attribute('data-state', 'checking')
    cells.nth(2).evaluate("el => { const d = new DataTransfer(); d.setData('text/plain', '314159'); el.dispatchEvent(new ClipboardEvent('paste', {bubbles:true, clipboardData:d})); }")
    page.wait_for_timeout(700)
    expect(o).to_have_attribute('data-state', 'editing')
    assert cells.evaluate_all('(els) => els.map(el => el.value).join("")') == '314159'
    o.locator('[data-check]').click()
    expect(o).to_have_attribute('data-state', 'correct')
    cells.nth(5).focus()
    page.keyboard.press('Backspace')
    page.keyboard.press('Backspace')
    expect(cells.nth(4)).to_be_focused()
    page.keyboard.press('ArrowLeft')
    expect(cells.nth(3)).to_be_focused()
    cells.nth(0).fill('000000')
    o.locator('[data-check]').click()
    expect(o).to_have_attribute('data-state', 'error')

    pull = card(page, 'pull-refresh')
    drag(page, pull.locator('[data-pull-handle]'), 0, 70)
    expect(pull).to_have_attribute('data-state', 'idle')
    drag(page, pull.locator('[data-pull-handle]'), 0, 220, cancel=True)
    expect(pull).to_have_attribute('data-state', 'cancelled')
    pull.locator('[data-refresh]').click()
    pull.locator('[data-cancel]').click()
    page.wait_for_timeout(1350)
    expect(pull.locator('[data-edition]')).to_have_text('1')
    drag(page, pull.locator('[data-pull-handle]'), 0, 220)
    expect(pull.locator('[data-edition]')).to_have_text('2')

    sw = card(page, 'swipe')
    drag(page, sw.locator('[data-swipe-row]'), -140, 0)
    expect(sw.locator('[data-reveal]')).to_have_attribute('aria-expanded', 'true')
    sw.locator('[data-delete]').click()
    expect(sw.locator('[data-undo]')).to_be_focused()
    expect(sw.locator('[data-swipe]')).to_be_hidden()
    sw.locator('[data-undo]').click()
    expect(sw.locator('[data-reveal]')).to_be_focused()
    sw.locator('[data-reveal]').click()
    sw.locator('[data-archive]').click()
    sw.locator('[data-reset]').click()
    drag(page, sw.locator('[data-swipe-row]'), -140, 0, cancel=True)
    expect(sw).to_have_attribute('data-state', 'closed')
    assert sw.locator('[data-swipe-row]').evaluate('el => getComputedStyle(el).touchAction') == 'pan-y'

    r = card(page, 'reorder')
    r.locator('[data-down]').first.click()
    expect(r).to_have_attribute('data-order', 'gallery,coffee,studio')
    r.locator('[data-reset]').click()
    page.wait_for_timeout(300)
    drag(page, r.locator('[data-handle]').first, 0, 190)
    expect(r).to_have_attribute('data-order', 'gallery,studio,coffee')
    r.locator('[data-reset]').click()
    page.wait_for_timeout(300)
    drag(page, r.locator('[data-handle]').first, 0, 190, cancel=True)
    expect(r).to_have_attribute('data-order', 'coffee,gallery,studio')
    expect(r.locator('[data-handle]').first).to_be_focused()

    a = card(page, 'accordion')
    toggle = a.locator('[data-accordion-toggle]').first
    toggle.click()
    toggle.click()
    toggle.click()
    expect(toggle).to_have_attribute('aria-expanded', 'true')
    a.locator('#fb-answer-one a').focus()
    page.keyboard.press('Escape')
    expect(toggle).to_be_focused()
    assert a.locator('#fb-answer-one').evaluate('el => el.inert')

    s = card(page, 'search')
    s.locator('[data-search-toggle]').focus()
    expect(s).to_have_attribute('data-state', 'open')
    s.locator('input').fill('spring')
    expect(s.locator('[data-results] li:not([hidden])')).to_have_count(1)
    page.keyboard.press('Escape')
    expect(s).to_have_attribute('data-state', 'closed')
    expect(s.locator('[data-search-toggle]')).to_be_focused()
    assert s.locator('[data-search-panel]').evaluate('el => el.inert')

    m = card(page, 'menu')
    m.locator('[data-menu-button]').click()
    m.locator('[data-menu-panel] a').first.focus()
    page.keyboard.press('Escape')
    expect(m.locator('[data-menu-button]')).to_be_focused()
    expect(m).to_have_attribute('data-state', 'closed')
    assert m.locator('[data-menu-panel]').evaluate('el => el.inert')

    w = card(page, 'wizard')
    w.locator('[data-next]').click()
    expect(w).to_have_attribute('data-step', '0')
    w.locator('[data-name]').fill('Ada')
    w.locator('[data-next]').click()
    w.locator('[data-next]').click()
    expect(w).to_have_attribute('data-step', '1')
    w.locator('input[value="Cards"]').check()
    w.locator('[data-next]').click()
    expect(w.locator('[data-review]')).to_contain_text('Ada')
    w.locator('[data-back]').click()
    expect(w.locator('input[value="Cards"]')).to_be_checked()
    w.locator('[data-next]').click()
    w.locator('[data-next]').click()
    expect(w).to_have_attribute('data-state', 'complete')
    w.locator('[data-reset]').click()
    expect(w).to_have_attribute('data-step', '0')

    d = card(page, 'download')
    d.locator('[data-start]').click()
    page.wait_for_timeout(800)
    d.locator('[data-cancel]').click()
    partial = d.locator('[data-ring]').get_attribute('aria-valuenow')
    assert 0 < int(partial) < 100
    page.wait_for_timeout(2600)
    expect(d).to_have_attribute('data-state', 'cancelled')
    expect(d.locator('[data-ring]')).to_have_attribute('aria-valuenow', partial)
    d.locator('[data-start]').click()
    expect(d).to_have_attribute('data-state', 'done', timeout=4000)
    d.locator('[data-reset]').click()
    expect(d.locator('[data-ring]')).to_have_attribute('aria-valuenow', '0')

    u = card(page, 'upload')
    u.locator('input').set_input_files({'name': 'local-study.txt', 'mimeType': 'text/plain', 'buffer': b'not transmitted'})
    expect(u.locator('[data-filename]')).to_have_text('local-study.txt')
    u.locator('[data-cancel]').click()
    page.wait_for_timeout(2200)
    expect(u).to_have_attribute('data-state', 'cancelled')
    u.locator('[data-dropzone]').evaluate("el => { const d = new DataTransfer(); d.items.add(new File(['local'], '<notes>.txt', {type:'text/plain'})); el.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:d})); }")
    expect(u.locator('[data-filename]')).to_have_text('<notes>.txt')
    expect(u).to_have_attribute('data-state', 'done', timeout=3500)
    u.locator('[data-reset]').click()
    expect(u.locator('[data-filename]')).to_have_text('No file selected')

    sk = card(page, 'skeleton')
    height = sk.locator('[data-preview]').evaluate('el => el.getBoundingClientRect().height')
    sk.locator('[data-load]').click()
    expect(sk.locator('[data-preview]')).to_have_attribute('aria-busy', 'true')
    assert sk.locator('[data-content]').evaluate('el => el.inert')
    assert abs(sk.locator('[data-preview]').evaluate('el => el.getBoundingClientRect().height') - height) < 1
    sk.locator('[data-load]').click()
    expect(sk).to_have_attribute('data-state', 'ready', timeout=2500)
    expect(sk.locator('[data-version]')).to_have_text('2')
    sk.locator('[data-load]').click()
    sk.locator('[data-cancel]').click()
    page.wait_for_timeout(1300)
    expect(sk.locator('[data-version]')).to_have_text('2')

    ch = card(page, 'chips')
    for _ in range(3):
        ch.locator('[data-choice]').first.click()
    expect(ch.locator('[data-choice]').first).to_have_attribute('aria-pressed', 'true')
    expect(ch.locator('[data-status]')).to_contain_text('Clarity')
    ch.locator('[data-reset]').click()
    expect(ch.locator('[data-status]')).to_have_text('No lenses selected.')

    dock = card(page, 'dock')
    dock.locator('[data-dock-item]').first.focus()
    page.keyboard.press('ArrowRight')
    expect(dock.locator('[data-dock-item]').nth(1)).to_be_focused()
    page.keyboard.press('Enter')
    expect(dock.locator('[data-status]')).to_contain_text('Library selected')
    page.wait_for_timeout(600)
    scale = dock.locator('.fb-dock-icon').nth(1).evaluate('el => new DOMMatrix(getComputedStyle(el).transform).a')
    assert scale == 1 if reduced else scale > 1.4
    if not reduced:
        page.evaluate("() => import('../js/core/motion.js').then(({motion}) => motion.setReduced(true, {persist:false}))")
        page.wait_for_timeout(80)
        assert dock.locator('.fb-dock-icon').nth(1).evaluate('el => new DOMMatrix(getComputedStyle(el).transform).a') == 1
        page.evaluate("() => import('../js/core/motion.js').then(({motion}) => motion.setReduced(false, {persist:false}))")
    note = ch.locator('[data-notes]')
    note.locator('button').click()
    expect(note.locator('button')).to_have_attribute('aria-expanded', 'true')
    assert not note.locator('.notes__body').evaluate('el => el.inert')
    page.locator('[data-complete]').click()
    expect(page.locator('[data-complete]')).to_have_attribute('aria-pressed', 'true')
    page.reload()
    expect(page.locator('[data-complete]')).to_have_attribute('aria-pressed', 'true')


def springs(page, url, reduced=False):
    ready(page, url, 'springs', 6)
    assert page.locator('[data-lesson]').count() == 7
    page.locator('[data-spring-preset="stiff"]').click()
    expect(page.locator('[data-param="stiffness"]')).to_have_value('210')
    i = card(page, 'interrupt')
    i.locator('[data-interrupt-area]').focus()
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(600)
    assert i.locator('.lane--spring .lane__ball').evaluate('el => new DOMMatrix(getComputedStyle(el).transform).m41') > 0
    card(page, 'regimes').locator('[data-play]').click()
    page.wait_for_timeout(400)
    assert all(len(d or '') > 100 for d in card(page, 'regimes').locator('.regime__trace').evaluate_all('(els) => els.map(el => el.getAttribute("d"))'))
    f = card(page, 'fling')
    f.locator('[data-puck]').scroll_into_view_if_needed()
    b = f.locator('[data-puck]').bounding_box()
    x, y = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 90, y + 25, steps=8)
    assert '· 0 px/s' not in f.locator('[data-fling-readout]').text_content(), 'moving puck must retain sampled velocity'
    page.mouse.up()
    f.locator('[data-reset]').click()
    f.locator('[data-snap]').click()
    f.locator('[data-puck]').focus()
    page.keyboard.press('ArrowRight')
    expect(f).to_have_attribute('data-state', 'idle', timeout=4000)
    drag(page, f.locator('[data-puck]'), -50, 30, cancel=True)
    expect(f).to_have_attribute('data-state', 'idle')

    rb = card(page, 'rubber')
    viewport = rb.locator('[data-rb-viewport]')
    viewport.scroll_into_view_if_needed()
    b = viewport.bounding_box()
    x, y = b['x'] + b['width'] / 2, b['y'] + 80
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + 120, steps=10)
    assert float(rb.get_attribute('data-offset')) > 0
    rb.locator('[data-rb-toggle]').evaluate('el => el.click()')
    assert float(rb.get_attribute('data-offset')) == 0
    page.mouse.move(x, y + 121)
    assert float(rb.get_attribute('data-offset')) == 0
    page.mouse.up()
    rb.locator('[data-rb-toggle]').click()
    if not reduced:
        viewport.scroll_into_view_if_needed()
        b = viewport.bounding_box()
        x, y = b['x'] + b['width'] / 2, b['y'] + 80
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, y + 150, steps=12)
        page.wait_for_timeout(140)  # release without a throw
        page.mouse.up()
        page.mouse.down()  # regrab rendered overscroll
        before = float(rb.get_attribute('data-offset'))
        page.mouse.move(x, y + 151)
        after = float(rb.get_attribute('data-offset'))
        assert abs(after - before) < 3, (before, after)
        page.mouse.up()
        rb.locator('[data-rb-toggle]').evaluate('el => el.click()')
        assert float(rb.get_attribute('data-offset')) <= 0
    viewport.focus()
    page.keyboard.press('End')
    page.wait_for_timeout(1400)
    assert abs(float(rb.get_attribute('data-offset')) - float(rb.get_attribute('data-min'))) < 1

    g = card(page, 'gravity')
    g.scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    g.locator('[data-clear]').click()
    canvas = g.locator('canvas')
    canvas.focus()
    for _ in range(8):
        page.keyboard.press('Enter')
    expect(g.locator('[data-ball-count]')).to_have_text('8')
    page.wait_for_timeout(500)
    positions = json.loads(canvas.get_attribute('data-positions'))
    size = canvas.bounding_box()
    assert all(b['r'] <= b['x'] <= size['width'] - b['r'] + 1 and b['r'] <= b['y'] <= size['height'] - b['r'] + 1 for b in positions)
    if not reduced:
        g.locator('[data-pause]').click()
        expect(g).to_have_attribute('data-state', 'paused')
    image = canvas.evaluate('el => el.toDataURL()')
    page.wait_for_timeout(250)
    assert canvas.evaluate('el => el.toDataURL()') == image
    g.locator('[data-clear]').click()
    expect(g.locator('[data-ball-count]')).to_have_text('0')
    chain = card(page, 'chain').locator('canvas')
    chain.focus()
    before = chain.get_attribute('data-target')
    page.keyboard.press('ArrowRight')
    assert chain.get_attribute('data-target') != before
    page.keyboard.press('Home')
    if reduced:
        image = chain.evaluate('el => el.toDataURL()')
        page.wait_for_timeout(500)
        assert chain.evaluate('el => el.toDataURL()') == image
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(300)
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:8080/')
    args = parser.parse_args()
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            for reduced in (False, True):
                ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce' if reduced else 'no-preference')
                ctx.route('https://fonts.googleapis.com/**', lambda route: route.abort())
                ctx.route('https://fonts.gstatic.com/**', lambda route: route.abort())
                page = ctx.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' and '[kinetic]' in msg.text else None)
                feedback(page, args.url, reduced)
                springs(page, args.url, reduced)
                print(f'14 feedback patterns and physics checks passed: reduced={reduced}')
                ctx.close()
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
            page = ctx.new_page()
            for chapter, count in [('feedback', 14), ('springs', 6)]:
                ready(page, args.url, chapter, count)
                assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), chapter
                for demo in page.locator('[data-demo]').all():
                    demo.scroll_into_view_if_needed()
                    assert demo.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), demo.get_attribute('data-demo')
            ctx.close()
            assert not errors, '\n'.join(errors)
            print('Mobile overflow and runtime error checks passed.')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
