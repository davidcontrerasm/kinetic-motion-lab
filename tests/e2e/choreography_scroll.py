"""Standalone Chapter 05/06 browser suite (no package or server changes).

Serve kinetic/ with `python -m http.server 8080`, then run:
    python tests/e2e/choreography_scroll.py --url http://localhost:8080/
Requires: pip install playwright && playwright install chromium
Optional --browser firefox or webkit exercises the automatic fallback too.
Fonts are fulfilled with empty CSS (not aborted); all console errors are failures.
These checks are new coverage, not a claim that any external suite has passed.
"""
from __future__ import annotations

import argparse
from playwright.sync_api import sync_playwright, expect


def demo(page, key):
    return page.locator(f'[data-demo="{key}"]')


def ready(page, url, chapter):
    page.goto(f'{url.rstrip("/")}/guide/{chapter}.html')
    page.wait_for_function('(n) => document.querySelectorAll("[data-demo][data-ready=true]").length === n', arg=6)
    page.add_style_tag(content='html { scroll-behavior: auto !important; }')
    assert page.locator('[data-lesson]').count() == 6
    assert page.locator('.lesson .callout--key').count() == 6
    assert page.locator('.lesson .callout--warn').count() == 6
    assert page.locator('.lesson details.snippet').count() == 6
    assert page.locator('[data-quiz] .quiz__q').count() == 3
    assert page.locator('[data-chapter-nav] a').count() == 2
    ids = page.locator('[id]').evaluate_all('(els) => els.map(el => el.id)')
    assert len(ids) == len(set(ids)), 'duplicate IDs'


def range_value(locator, value):
    locator.evaluate('(el, value) => { el.value = value; el.dispatchEvent(new Event("input", {bubbles:true})); }', str(value))


def center(page, locator):
    locator.evaluate('el => el.scrollIntoView({block:"center", behavior:"instant"})')
    page.wait_for_timeout(100)


def scroll_fraction(locator, value):
    locator.evaluate('(el, p) => { el.scrollTop = p * (el.scrollHeight - el.clientHeight); }', value)


def matrix(locator):
    return locator.evaluate('el => { const m = new DOMMatrix(getComputedStyle(el).transform); return {x:m.m41, y:m.m42, scale:m.a}; }')


def reduced(page, value):
    page.evaluate('(v) => import("../js/core/motion.js").then(({motion}) => motion.setReduced(v, {persist:false}))', value)


def quizzes(page):
    for question in page.locator('.quiz__q').all():
        question.locator('.quiz__opt').nth(int(question.get_attribute('data-answer'))).click()
    expect(page.locator('[data-quiz-result]')).to_contain_text('3 of 3')
    page.locator('[data-quiz-retry]').click()
    expect(page.locator('.quiz__q.is-answered')).to_have_count(0)
    page.locator('[data-complete]').click()
    expect(page.locator('[data-complete]')).to_have_attribute('aria-pressed', 'true')


def choreography(page, url, is_reduced):
    ready(page, url, 'choreography')
    s = demo(page, 'stagger')
    center(page, s)
    assert s.locator('.ch-blocks span').count() == 30
    range_value(s.locator('[data-step]'), 100)
    range_value(s.locator('[data-duration]'), 400)
    for pattern in ('index', 'reverse', 'center', 'edges', 'diagonal', 'random'):
        s.locator('select').select_option(pattern)
        delays = s.locator('.ch-blocks span').evaluate_all('(els) => els.map(el => +el.dataset.delay)')
        assert abs(float(s.get_attribute('data-total')) - max(delays) - 400) < .01
        s.locator('[data-replay]').click()
        assert delays == s.locator('.ch-blocks span').evaluate_all('(els) => els.map(el => +el.dataset.delay)')
    s.locator('select').select_option('index')
    expect(s.locator('[data-total]')).to_contain_text('3,300ms')
    if not is_reduced:
        s.locator('[data-replay]').click()
        page.wait_for_timeout(120)
        assert 0 < float(s.get_attribute('data-time')) < 3300
        reduced(page, True)
        expect(s).to_have_attribute('data-time', '3300.00')
        reduced(page, False)
    range_value(s.locator('[data-step]'), 0)
    s.locator('[data-replay]').click()
    page.wait_for_timeout(550)
    assert all(abs(x - 1) < .001 for x in s.locator('.ch-blocks span').evaluate_all('(els) => els.map(el => +getComputedStyle(el).opacity)'))

    seq = demo(page, 'sequence')
    center(page, seq)
    for mode, starts, total in [('parallel', '0,0,0', 600), ('sequential', '0,600,1000', 1300), ('overlap', '0,300,500', 800)]:
        seq.locator('[data-mode]').select_option(mode)
        expect(seq).to_have_attribute('data-starts', starts)
        assert float(seq.get_attribute('data-total')) == total
        range_value(seq.locator('[data-scrub]'), total / 2)
        before = seq.get_attribute('data-time')
        page.wait_for_timeout(100)
        assert seq.get_attribute('data-time') == before
        if not is_reduced and mode == 'sequential':
            poses = seq.locator('[data-part]').evaluate_all('(els) => els.map(el => +el.dataset.progress)')
            assert poses[0] == 1 and 0 < poses[1] < 1 and poses[2] == 0
        seq.locator('[data-pause]').click()
        page.wait_for_timeout(100)
        if not is_reduced:
            assert float(seq.get_attribute('data-time')) > float(before)
        seq.locator('[data-replay]').click()
    range_value(seq.locator('[data-overlap]'), 100)
    expect(seq).to_have_attribute('data-starts', '0,0,0')
    range_value(seq.locator('[data-overlap]'), 0)
    expect(seq).to_have_attribute('data-starts', '0,600,1000')
    if not is_reduced:
        seq.locator('[data-replay]').click()
        seq.locator('[data-pause]').click()
        frozen = seq.get_attribute('data-time')
        page.wait_for_timeout(100)
        assert seq.get_attribute('data-time') == frozen
        seq.locator('[data-pause]').click()
        page.evaluate('window.scrollTo({top:0, behavior:"instant"})')
        page.wait_for_timeout(150)
        frozen = seq.get_attribute('data-time')
        page.wait_for_timeout(250)
        assert seq.get_attribute('data-time') == frozen, 'offscreen transport must suspend'

    t = demo(page, 'text')
    center(page, t)
    for style in ('words', 'chars', 'lines', 'fade', 'rotation', 'blur'):
        t.locator('[data-style]').select_option(style)
        t.locator('[data-replay]').click()
        t.locator('[data-replay]').click()
        expect(t.locator('[data-sentence] .sr-only')).to_have_text('Good motion helps people see what changed.')
        assert t.locator('[data-sentence] [aria-hidden=true]').count() == 1
    if not is_reduced:
        reduced(page, True)
        assert 'immediately readable' in t.locator('[data-text-report]').text_content()
        reduced(page, False)

    loaders = demo(page, 'loaders')
    center(page, loaders)
    assert loaders.locator('.ch-loader').count() == 6
    loaders.locator('[data-pause]').click()
    expect(loaders).to_have_attribute('data-paused', 'true')
    assert loaders.locator('.ch-loader i').first.evaluate('el => { const s = getComputedStyle(el); return s.animationName === "none" || s.animationPlayState === "paused"; }')
    loaders.locator('[data-pause]').click()
    page.evaluate('window.scrollTo({top:0, behavior:"instant"})')
    expect(loaders).to_have_attribute('data-active', 'false')
    assert loaders.locator('.ch-loader i').first.evaluate('el => { const s = getComputedStyle(el); return s.animationName === "none" || s.animationPlayState === "paused"; }')

    phone = demo(page, 'continuity')
    center(page, phone)
    for i in range(3):
        source = phone.locator('[data-item]').nth(i)
        source.click()
        expect(phone.locator('[data-back]')).to_be_focused()
        assert phone.locator('[data-list-view]').evaluate('el => el.inert')
        assert not phone.locator('[data-detail]').evaluate('el => el.inert')
        # Interrupt without Playwright waiting for the moving action to become stable.
        if i == 2:
            page.keyboard.press('Escape')
        else:
            phone.locator('[data-back]').click()
        expect(source).to_be_focused()
        expect(phone.locator('[data-detail]')).to_be_hidden()
        assert phone.locator('[data-detail]').evaluate('el => el.inert')
        assert not page.evaluate('document.documentElement.classList.contains("is-modal-open")')
    phone.locator('[data-item]').nth(1).click()
    expect(phone).to_have_attribute('data-state', 'detail')
    phone.locator('[data-save]').click()
    expect(phone.locator('[data-save]')).to_have_attribute('aria-pressed', 'true')
    phone.locator('[data-back]').click()
    expect(phone.locator('[data-detail]')).to_be_hidden()
    phone.locator('[data-item]').nth(1).click()
    expect(phone).to_have_attribute('data-state', 'detail')
    expect(phone.locator('[data-save]')).to_have_text('Saved ✓')
    page.keyboard.press('Escape')
    expect(phone.locator('[data-detail]')).to_be_hidden()

    a = demo(page, 'attention')
    center(page, a)
    for _ in range(3):
        a.locator('[data-replay]').click()
        changed = a.locator('.ch-changed')
        assert changed.count() == 2
        name = changed.first.locator('b').text_content()
        expect(a.locator('[data-attention-result]')).to_contain_text(name)
        assert changed.locator('[data-saved]').all_text_contents() == ['Saved ✓', 'Saved ✓']
    # Interaction isolation: attention does not touch the other study's inputs.
    expect(s.locator('[data-step]')).to_have_value('0')
    quizzes(page)


def native_endpoints(page, n, force, is_reduced):
    n.locator('[data-force-js]').set_checked(force)
    src = n.locator('[data-native-scroll]')
    for p in (0, .5, 1, 0):
        scroll_fraction(src, p)
        page.wait_for_timeout(180)
        actual = float(n.get_attribute('data-progress'))
        assert abs(actual - p) < .005
        bar = matrix(n.locator('[data-native-progress]'))
        card = matrix(n.locator('[data-native-card]'))
        assert abs(bar['scale'] - p) < .025, (n.get_attribute('data-engine'), p, bar)
        distance = float(n.get_attribute('data-travel'))
        assert abs(card['x'] - (0 if is_reduced else distance * p)) < 2
    scroll_fraction(src, .6)
    page.wait_for_timeout(100)
    previous = src.evaluate('el => el.scrollTop')
    n.locator('[data-force-js]').set_checked(not force)
    assert src.evaluate('el => el.scrollTop') == previous, 'switch preserves source position'


def scroll_chapter(page, url, is_reduced):
    ready(page, url, 'scroll')
    t = demo(page, 'triggered-linked')
    center(page, t)
    left, right = t.locator('[data-trigger-scroll]'), t.locator('[data-linked-scroll]')
    left.focus()
    page.keyboard.press('PageDown')
    page.wait_for_timeout(300)
    assert left.evaluate('el => el.scrollTop') > 0
    page.keyboard.press('End')
    expect(t).to_have_attribute('data-triggered', 'true')
    page.wait_for_timeout(750)
    expect(t).to_have_attribute('data-entrance', '1.0000')
    page.keyboard.press('Home')
    page.wait_for_timeout(250)
    expect(t).to_have_attribute('data-entrance', '1.0000')
    assert right.evaluate('el => el.scrollTop') == 0
    right.focus()
    page.keyboard.press('End')
    page.wait_for_timeout(350)
    assert float(right.get_attribute('data-progress')) > .98
    end_pose = matrix(t.locator('[data-linked-box]'))
    page.keyboard.press('Home')
    page.wait_for_timeout(350)
    assert matrix(t.locator('[data-linked-box]'))['y'] < end_pose['y'] - 60
    t.locator('[data-replay]').click()
    expect(t).to_have_attribute('data-triggered', 'false')
    assert left.evaluate('el => el.scrollTop') == 0 and right.evaluate('el => el.scrollTop') == 0

    p = demo(page, 'parallax')
    center(page, p)
    range_value(p.locator('[data-depth-speed]'), 2)
    before = matrix(p.locator('[data-depth]').last)['y']
    page.evaluate('window.scrollBy({top:120, behavior:"instant"})')
    page.wait_for_timeout(150)
    after = matrix(p.locator('[data-depth]').last)['y']
    if is_reduced:
        assert before == after == 0
    else:
        assert abs(after - before) > 2
        reduced(page, True)
        assert matrix(p.locator('[data-depth]').last)['y'] == 0
        reduced(page, False)
    range_value(p.locator('[data-depth-speed]'), 0)
    assert matrix(p.locator('[data-depth]').last)['y'] == 0

    story = demo(page, 'story')
    for i, values in enumerate(([20, 35, 15], [55, 50, 40], [85, 70, 90])):
        story.locator('[data-jump]').nth(i).click()
        page.wait_for_timeout(150)
        got = story.locator('[data-story-value]').all_text_contents()
        assert all(abs(int(a) - b) <= 1 for a, b in zip(got, values)), got
        expect(story.locator('[data-story-step] h3').nth(i)).to_be_focused()
    if not is_reduced:
        story.locator('[data-jump]').nth(0).click()
        delta = story.locator('[data-story-step]').evaluate_all('(els) => (els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().top) / 2')
        page.evaluate('(dy) => window.scrollBy({top:dy, behavior:"instant"})', delta)
        page.wait_for_timeout(150)
        value = int(story.locator('[data-story-value]').first.text_content())
        assert 30 < value < 45, value
    else:
        assert story.locator('[data-chart]').evaluate('el => getComputedStyle(el).position') == 'static'
        assert story.locator('[data-story-step]').first.evaluate('el => getComputedStyle(el).minHeight') == '0px'

    c = demo(page, 'counters')
    center(page, c)
    c.locator('[data-replay]').click()
    c.locator('[data-replay]').click()
    for _ in range(5):
        numbers = [int(s) for s in c.locator('[data-number]').all_text_contents()]
        assert all(0 <= a <= b for a, b in zip(numbers, [72, 48, 90]))
        page.wait_for_timeout(70)
    expect(c).to_have_attribute('data-state', 'complete', timeout=2500)
    assert c.locator('[data-number]').all_text_contents() == ['72', '48', '90']
    assert c.locator('[data-number][aria-live]').count() == 0
    assert c.locator('.sr-only').count() == 3

    n = demo(page, 'native')
    center(page, n)
    native_endpoints(page, n, False, is_reduced)
    native_endpoints(page, n, True, is_reduced)
    n.locator('[data-force-js]').check()
    expect(n).to_have_attribute('data-engine', 'js')
    n.locator('[data-replay]').click()
    page.wait_for_timeout(100)
    assert matrix(n.locator('[data-native-progress]'))['scale'] == 0
    n.locator('[data-force-js]').uncheck()
    expected = 'native' if n.get_attribute('data-supported') == 'true' else 'js'
    expect(n).to_have_attribute('data-engine', expected)
    scroll_fraction(n.locator('[data-native-scroll]'), .4)
    page.wait_for_timeout(150)
    pose = matrix(n.locator('[data-native-card]'))
    page.evaluate('window.scrollBy({top:40, behavior:"instant"})')
    page.wait_for_timeout(100)
    assert abs(matrix(n.locator('[data-native-card]'))['x'] - pose['x']) < .1

    v = demo(page, 'velocity')
    center(page, v)
    src = v.locator('[data-velocity-scroll]')
    range_value(v.locator('[data-sensitivity]'), 12)
    scroll_fraction(src, .8)
    page.wait_for_timeout(60)
    angle = float(v.get_attribute('data-angle'))
    assert angle == 0 if is_reduced else 0 < angle <= 8
    scroll_fraction(src, .1)
    page.wait_for_timeout(90)
    angle = float(v.get_attribute('data-angle'))
    assert angle == 0 if is_reduced else -8 <= angle < 0
    page.wait_for_function('() => Math.abs(+document.querySelector("[data-demo=velocity]").dataset.angle) < .01')
    v.locator('[data-pause]').click()
    before = src.evaluate('el => el.scrollTop')
    src.focus()
    page.keyboard.press('PageDown')
    page.wait_for_timeout(300)
    assert src.evaluate('el => el.scrollTop') > before
    assert float(v.get_attribute('data-angle')) == 0
    v.locator('[data-pause]').click()
    if not is_reduced:
        scroll_fraction(src, 1)
        reduced(page, True)
        assert float(v.get_attribute('data-angle')) == 0
        reduced(page, False)
    quizzes(page)


def mobile(page, url):
    for chapter in ('choreography', 'scroll'):
        ready(page, url, chapter)
        assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), chapter
        for stage in page.locator('[data-demo]').all():
            center(page, stage)
            assert stage.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), stage.get_attribute('data-demo')
            assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
        if chapter == 'choreography':
            phone = demo(page, 'continuity')
            phone.locator('[data-item]').last.click()
            expect(phone).to_have_attribute('data-state', 'detail')
            phone.locator('[data-back]').click()
            expect(phone.locator('[data-item]').last).to_be_focused()
        else:
            n = demo(page, 'native')
            center(page, n)
            n.locator('[data-force-js]').check()
            scroll_fraction(n.locator('[data-native-scroll]'), 1)
            page.wait_for_timeout(150)
            assert matrix(n.locator('[data-native-progress]'))['scale'] > .99
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
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            return ctx, page
        try:
            for is_reduced in (False, True):
                ctx, page = context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce' if is_reduced else 'no-preference')
                choreography(page, args.url, is_reduced)
                scroll_chapter(page, args.url, is_reduced)
                ctx.close()
                print(f'Desktop interactions checked: reduced={is_reduced}')
            for preference in ('no-preference', 'reduce'):
                ctx, page = context(viewport={'width': 390, 'height': 844}, has_touch=True, reduced_motion=preference)
                mobile(page, args.url)
                ctx.close()
            ctx, page = context(viewport={'width': 390, 'height': 844}, java_script_enabled=False)
            for chapter in ('choreography', 'scroll'):
                page.goto(f'{args.url.rstrip("/")}/guide/{chapter}.html')
                assert page.locator('[data-lesson]').count() == 6
                assert page.locator('.lesson__text p').count() >= 24
                assert page.locator('code[data-lang]').count() == 6
                assert page.locator('[data-chapter-nav] a').count() == 2
                assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
            ctx.close()
            assert not errors, '\n'.join(errors)
            print('Twelve demos, native/fallback endpoints, mobile, no-JS and console checks completed.')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
