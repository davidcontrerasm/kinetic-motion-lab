"""Global Kinetic integration checks. Serve the site separately; Chromium default.

Uses the existing Python Playwright environment. Screenshots are opt-in via
--shots (use /tmp); no artifacts are written by default. Existing chapter suites
remain responsible for their detailed gesture/physics/experiment checks.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright, expect

CHAPTERS = {
    'timing': (6, ['duration-ladder', 'distance-duration', 'asymmetry', 'latency', 'framerate', 'hover-intent']),
    'easing': (7, ['linear-vs-eased', 'easing-gallery', 'direction', 'linear-builder', 'steps', 'token-playground']),
    'springs': (7, ['interrupt', 'regimes', 'fling', 'rubber', 'gravity', 'chain']),
    'feedback': (5, ['password', 'otp', 'pull-refresh', 'swipe', 'reorder', 'accordion', 'search', 'menu', 'wizard', 'download', 'upload', 'skeleton', 'chips', 'dock']),
    'choreography': (6, ['stagger', 'sequence', 'text', 'loaders', 'continuity', 'attention']),
    'scroll': (6, ['triggered-linked', 'parallax', 'story', 'counters', 'native', 'velocity']),
    'layout': (6, ['flip-debugger', 'flip-grid', 'height', 'view-transitions', 'morph', 'leaderboard']),
    'depth': (6, ['elevation', 'card-flip', 'tilt', 'glass', 'spotlight', 'focus']),
    'craft': (5, ['reduced', 'main-thread', 'property-cost', 'thrashing', 'focus-ring']),
}
PAGES = ['index.html', 'guide/index.html', *[f'guide/{key}.html' for key in CHAPTERS], 'guide/cheatsheet.html']


def demo(page, key):
    return page.locator(f'[data-demo="{key}"]')


def ready(page, base, path):
    response = page.goto(urljoin(base, path))
    assert response and response.status == 200, path
    page.wait_for_selector('html.is-loaded', timeout=15000)
    chapter = Path(path).stem if path.startswith('guide/') else None
    if chapter in CHAPTERS:
        expect(page.locator('[data-demo][data-ready=true]')).to_have_count(len(CHAPTERS[chapter][1]))
    page.add_style_tag(content='html { scroll-behavior: auto !important; }')
    return chapter


def center(page, locator):
    locator.evaluate('el => el.scrollIntoView({block:"center", behavior:"instant"})')
    page.wait_for_timeout(100)


def top(page):
    page.evaluate('window.scrollTo({top:0, behavior:"instant"})')
    page.wait_for_timeout(950)


def offscreen(page, locator):
    page.evaluate('window.scrollTo({top:document.documentElement.scrollHeight, behavior:"instant"})')
    page.wait_for_timeout(150)
    assert locator.evaluate('el => { const r = el.getBoundingClientRect(); return r.bottom <= 0 || r.top >= innerHeight; }'), 'test must fully hide the study'


def reduce(page, value):
    page.evaluate('(value) => import(new URL("js/core/motion.js", window.siteBase)).then(({motion}) => motion.setReduced(value, {persist:false}))', value)


def value(locator, number, change=False):
    locator.evaluate('(el, value) => { el.value = value; el.dispatchEvent(new Event("input", {bubbles:true})); }', str(number))
    if change:
        locator.dispatch_event('change')


def state(page):
    return page.evaluate('JSON.parse(localStorage.getItem("kinetic:guide") || "{}")')


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), page.url


def header_fit(page):
    top(page)
    result = page.locator('[data-header]').evaluate('''header => {
      const visible = el => el && getComputedStyle(el).display !== 'none';
      const elements = [header.querySelector('.brand'), header.querySelector('.nav'), header.querySelector('.header__actions')].filter(visible);
      const rects = elements.map(el => el.getBoundingClientRect());
      const width = document.documentElement.clientWidth;
      const h = header.getBoundingClientRect();
      const contained = rects.every(r => r.left >= -1 && r.right <= width + 1 && r.top >= h.top - 1 && r.bottom <= h.bottom + 1);
      const separate = rects.every((r, i) => !i || rects[i - 1].right <= r.left + 1);
      const nav = header.querySelector('.nav');
      const linksFit = !visible(nav) || [...nav.querySelectorAll('.nav__link')].every(el => {
        const r = el.getBoundingClientRect(), n = nav.getBoundingClientRect();
        return r.left >= n.left && r.right <= n.right + 1 && r.height > 20;
      });
      const mobile = !visible(nav) ? visible(header.querySelector('[data-menu-toggle]')) : true;
      return {contained, separate, linksFit, mobile, rects: rects.map(r => [r.left,r.right,r.top,r.bottom])};
    }''')
    assert all(result[k] for k in ('contained', 'separate', 'linksFit', 'mobile')), (page.url, result)
    no_overflow(page)


def structures(page, chapter):
    if chapter not in CHAPTERS:
        return
    lessons, groups = CHAPTERS[chapter]
    assert page.locator('[data-lesson]').count() == lessons
    assert set(page.locator('[data-demo]').evaluate_all('(els) => els.map(el => el.dataset.demo)')) == set(groups)
    assert page.locator('.quiz__q').count() == 3
    for lesson in page.locator('[data-lesson]').all():
        assert lesson.locator('.callout--key').count() >= 1
        assert lesson.locator('.callout--warn').count() >= 1
        assert lesson.locator('details.snippet code[data-lang]').count() >= 1
    if chapter == 'easing':
        expect(page.locator('[data-bezier]')).to_have_attribute('data-primary-ready', 'true')
        assert page.locator('[data-bezier] [data-handle]').count() == 2
    if chapter == 'springs':
        assert page.locator('[data-spring-lab] canvas').count() == 2
        assert page.locator('[data-readout-omega]').text_content().strip()
    ids = page.locator('[id]').evaluate_all('(els) => els.map(el => el.id)')
    assert len(ids) == len(set(ids)), (chapter, 'duplicate IDs')
    expect(page.locator('[data-chapter-nav] a')).to_have_count(2)


def entries(page, base, shots, label):
    count = 0
    for path in PAGES:
        chapter = ready(page, base, path)
        structures(page, chapter)
        header_fit(page)
        if chapter in CHAPTERS:
            groups = page.locator('[data-demo], [data-bezier]:not([data-demo]), [data-spring-lab]:not([data-demo])')
            count += groups.count()
            for group in groups.all():
                center(page, group)
                no_overflow(page)
                assert group.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), (chapter, group.get_attribute('data-demo'))
                if group.get_attribute('data-demo') == 'hover-intent':
                    assert group.evaluate('''el => {
                        const view = el.querySelector('.stage__view').getBoundingClientRect();
                        return [...el.querySelectorAll('.intent__bar')].every(bar => {
                            const r = bar.getBoundingClientRect();
                            return r.left >= view.left && r.right <= view.right &&
                                [...bar.querySelectorAll('button')].every(button => {
                                    const b = button.getBoundingClientRect();
                                    return b.left >= r.left && b.right <= r.right && b.height >= 44;
                                });
                        });
                    }'''), 'intent control bounds'
        elif path == 'index.html':
            assert page.locator('[data-demos] > [data-demo]').count() == 12
            expect(page.locator('[data-notes][data-notes-ready=true]')).to_have_count(12)
            expect(page.locator('#field-guide [data-chapter-row] .ring')).to_have_count(9)
        elif path == 'guide/index.html':
            expect(page.locator('[data-chapter-row] .ring')).to_have_count(9)
        else:
            expect(page.locator('.glossary__item')).to_have_count(36)
            expect(page.locator('[data-ship-checklist] input')).to_have_count(10)
        if shots:
            top(page)
            page.screenshot(path=str(shots / f'{label}-{path.replace("/", "-")}.png'))
    assert count == 63, count


def navigation(page, base, mobile=False):
    ready(page, base, 'index.html')
    if mobile:
        top(page)
        page.locator('[data-menu-toggle]').click()
        page.locator('[data-menu] a[href="guide/index.html"]').click()
    else:
        page.locator('.nav a[href="guide/index.html"]').click()
    expect(page).to_have_url(urljoin(base, 'guide/index.html'))
    for chapter in CHAPTERS:
        ready(page, base, 'guide/index.html')
        top(page)
        if mobile:
            page.locator('[data-menu-toggle]').click()
            link = page.locator(f'[data-menu] a[href="{chapter}.html"]')
        else:
            page.locator('[data-chapter-toggle]').click()
            link = page.locator(f'[data-chapter-menu] a[href="{chapter}.html"]')
        expect(link).to_be_visible()
        link.click()
        expect(page).to_have_url(urljoin(base, f'guide/{chapter}.html'))
        expect(page.locator('[data-demo][data-ready=true]')).to_have_count(len(CHAPTERS[chapter][1]))
        nav = page.locator('[data-chapter-nav] a')
        keys = list(CHAPTERS)
        index = keys.index(chapter)
        expect(nav.first).to_have_attribute('href', f'{keys[index-1]}.html' if index else 'index.html')
        expect(nav.last).to_have_attribute('href', f'{keys[index+1]}.html' if index < 8 else 'cheatsheet.html')
    # Fetch every public HTML destination, including hashes, with the same origin.
    visited = set()
    for path in PAGES:
        ready(page, base, path)
        links = page.locator('a[href]').evaluate_all('(els) => els.map(el => el.href)')
        for href in links:
            if urlparse(href).netloc != urlparse(base).netloc:
                continue
            target = href.split('#')[0]
            if target not in visited:
                assert page.request.get(target).status == 200, href
                visited.add(target)


def copy_fallback(page, button):
    page.evaluate('''() => {
      window.copyFallbackCalls = 0;
      if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value: () => Promise.reject(new Error('test denial'))});
      if (!window.originalCopyCommand) window.originalCopyCommand = document.execCommand.bind(document);
      document.execCommand = (...args) => { if (args[0] === 'copy') window.copyFallbackCalls++; return window.originalCopyCommand(...args); };
    }''')
    button.click()
    expect(button).to_contain_text('Copied')
    assert page.evaluate('window.copyFallbackCalls') >= 1


def widgets_and_progress(page, base):
    ready(page, base, 'index.html')
    for notes in page.locator('[data-notes]').all():
        button = notes.locator('.notes__toggle')
        button.click()
        expect(button).to_have_attribute('aria-expanded', 'true')
        assert not notes.locator('.notes__body').evaluate('el => el.inert')
        button.click()
        assert notes.locator('.notes__body').evaluate('el => el.inert')
    ready(page, base, 'guide/timing.html')
    snippet = page.locator('details.snippet').first
    snippet.locator('summary').click()
    expect(snippet).to_have_attribute('open', '')
    copy_fallback(page, snippet.locator('.snippet__copy'))
    snippet.locator('summary').click()
    expect(snippet).not_to_have_attribute('open', '')

    # Negative dwell, then a visibility interruption, then continuous tall dwell.
    page.evaluate('localStorage.removeItem("kinetic:guide")')
    ready(page, base, 'guide/feedback.html')
    lesson = page.locator('[data-lesson]').first
    ident = lesson.get_attribute('id')
    lesson.evaluate('el => el.style.minHeight = "9000px"')
    def engage():
        lesson.evaluate('el => window.scrollTo({top:scrollY + el.getBoundingClientRect().top + 500, behavior:"instant"})')
        page.wait_for_timeout(80)
        assert lesson.evaluate('el => innerHeight / el.getBoundingClientRect().height < .2')
    engage()
    page.wait_for_timeout(400)
    page.evaluate('window.scrollTo({top:0, behavior:"instant"})')
    page.wait_for_timeout(1400)
    assert ident not in state(page).get('feedback', {}).get('seen', [])
    engage()
    page.wait_for_timeout(400)
    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,get:()=>true}); document.dispatchEvent(new Event("visibilitychange"));')
    page.wait_for_timeout(1300)
    assert ident not in state(page).get('feedback', {}).get('seen', [])
    page.evaluate('delete document.hidden; document.dispatchEvent(new Event("visibilitychange"));')
    page.wait_for_timeout(500)
    assert ident not in state(page).get('feedback', {}).get('seen', [])
    page.wait_for_timeout(900)
    assert state(page)['feedback']['seen'].count(ident) == 1
    page.wait_for_timeout(1300)
    assert state(page)['feedback']['seen'].count(ident) == 1

    # Wrong answer, retry, correct answer, and a lower later score cannot erase best.
    questions = page.locator('.quiz__q')
    for i, question in enumerate(questions.all()):
        answer = int(question.get_attribute('data-answer'))
        choice = (answer + 1) % question.locator('.quiz__opt').count() if i == 0 else answer
        question.locator('.quiz__opt').nth(choice).click()
    expect(page.locator('[data-quiz-result]')).to_contain_text('2 of 3')
    assert state(page)['feedback']['quiz'] == 2
    expect(page.locator('.quiz__opt.is-wrong')).to_have_count(1)
    page.locator('[data-quiz-retry]').click()
    for question in questions.all():
        question.locator('.quiz__opt').nth(int(question.get_attribute('data-answer'))).click()
    assert state(page)['feedback']['quiz'] == 3
    page.locator('[data-quiz-retry]').click()
    for question in questions.all():
        answer = int(question.get_attribute('data-answer'))
        question.locator('.quiz__opt').nth((answer + 1) % 3).click()
    assert state(page)['feedback']['quiz'] == 3
    page.locator('[data-complete]').click()
    assert state(page)['feedback']['done']
    page.reload()
    expect(page.locator('[data-complete]')).to_have_attribute('aria-pressed', 'true')
    assert state(page)['feedback']['quiz'] == 3
    page.locator('[data-complete]').click()
    assert not state(page)['feedback']['done']

    # Routing base and BFCache/back navigation must reflect the same persisted key.
    page.evaluate('localStorage.setItem("kinetic:guide", JSON.stringify({timing:{seen:[],quiz:3,done:true}}))')
    ready(page, base, 'index.html')
    expect(page.locator('[data-chapter-row=timing] [data-ring-label]')).to_have_text('100%')
    expect(page.locator('[data-overall-pct]')).to_have_text('11')
    expect(page.locator('[data-resume]')).to_have_attribute('href', 'guide/easing.html')
    page.locator('[data-resume]').click()
    page.locator('[data-complete]').click()
    page.go_back()
    expect(page.locator('[data-chapter-row=easing] [data-ring-label]')).to_have_text('100%')
    expect(page.locator('[data-resume]')).to_have_attribute('href', 'guide/springs.html')
    ready(page, base, 'guide/index.html')
    expect(page.locator('[data-overall-pct]')).to_have_text('22')
    expect(page.locator('[data-resume]')).to_have_attribute('href', 'springs.html')
    page.locator('[data-progress-reset]').click()
    assert state(page) == {}
    expect(page.locator('[data-overall-pct]')).to_have_text('0')
    ready(page, base, 'index.html')
    expect(page.locator('[data-resume]')).to_have_attribute('href', 'guide/timing.html')
    page.evaluate('localStorage.setItem("kinetic:guide", "{not json")')
    ready(page, base, 'guide/index.html')
    expect(page.locator('[data-overall-pct]')).to_have_text('0')


def frozen(page, locator, expression='el => getComputedStyle(el).transform', delay=350):
    before = locator.evaluate(expression)
    page.wait_for_timeout(delay)
    assert locator.evaluate(expression) == before, 'inactive sample is still changing'


def timing(page, base, is_reduced):
    ready(page, base, 'guide/timing.html')
    ladder = demo(page, 'duration-ladder')
    center(page, ladder)
    ladder.locator('[data-play]').click()
    ladder.locator('[data-loop]').click()
    if not is_reduced:
        expect(ladder).to_have_attribute('data-loop-pending', 'true')
    offscreen(page, ladder)
    expect(ladder).to_have_attribute('data-loop-pending', 'false')
    frozen(page, ladder.locator('.rail__ball').last, delay=2100)
    center(page, ladder)
    if not is_reduced:
        expect(ladder).to_have_attribute('data-loop-pending', 'true')
        page.emulate_media(reduced_motion='reduce')
        expect(ladder).to_have_attribute('data-loop-pending', 'false')
        frozen(page, ladder.locator('.rail__ball').last)
        page.emulate_media(reduced_motion='no-preference')
    ladder.locator('[data-loop]').click()
    ladder.locator('[data-play]').click()

    distance = demo(page, 'distance-duration')
    center(page, distance)
    distance.locator('[data-play]').evaluate('el => { for(let i=0;i<12;i++) el.click(); }')
    assert distance.evaluate('el => el.getAnimations({subtree:true}).length <= 6')
    reduce(page, True)
    assert distance.evaluate('el => el.getAnimations({subtree:true}).length') == 0
    for row in distance.locator('.dist-row').all():
        assert row.locator('.rail__ball').evaluate('el => new DOMMatrix(getComputedStyle(el).transform).m41') > 0
    if not is_reduced:
        reduce(page, False)
    asym = demo(page, 'asymmetry')
    asym.locator('[data-toggle-sheet]').click()
    expect(asym.locator('.sheet.is-open')).to_have_count(2)
    asym.locator('[data-toggle-sheet]').click()
    expect(asym.locator('.sheet.is-open')).to_have_count(0)

    latency = demo(page, 'latency')
    center(page, latency)
    value(latency.locator('[data-latency-delay]'), 1000)
    latency.locator('[data-latency-btn]').click()
    expect(latency.locator('[data-latency-status]')).to_have_text('Saving…')
    latency.locator('[data-latency-btn]').click()
    expect(latency.locator('[data-latency-extra]')).to_have_text('1')
    reduce(page, True)
    expect(latency.locator('[data-latency-btn]')).to_have_attribute('aria-busy', 'true')
    expect(latency.locator('[data-latency-status]')).to_have_text('Saved after 1000ms')
    frozen(page, latency.locator('[data-timeline-marker]'))
    latency.locator('[data-latency-ack]').click()
    latency.locator('[data-latency-btn]').click()
    latency.locator('[data-latency-btn]').click()
    expect(latency.locator('[data-latency-extra]')).to_have_text('2')
    expect(latency.locator('[data-latency-status]')).to_have_text('Saved after 1000ms')
    if not is_reduced:
        reduce(page, False)

    rate = demo(page, 'framerate')
    center(page, rate)
    expect(rate).to_have_attribute('data-running', 'false' if is_reduced else 'true')
    rate.locator('[data-toggle]').click()
    expect(rate).to_have_attribute('data-running', 'false')
    frozen(page, rate.locator('.rail__ball').first)
    rate.locator('[data-toggle]').click()
    offscreen(page, rate)
    expect(rate).to_have_attribute('data-running', 'false')
    center(page, rate)
    if not is_reduced:
        expect(rate).to_have_attribute('data-running', 'true')
        page.emulate_media(reduced_motion='reduce')
        expect(rate).to_have_attribute('data-running', 'false')
        frozen(page, rate.locator('.rail__ball').first)
        page.emulate_media(reduced_motion='no-preference')

    intent = demo(page, 'hover-intent')
    center(page, intent)
    buttons = intent.locator('[data-intent-group=intent] [data-tip]')
    buttons.nth(0).hover()
    page.wait_for_timeout(80)
    buttons.nth(1).focus()
    page.wait_for_timeout(500)
    expect(intent.locator('[data-intent-group=intent] [data-tip-el]')).to_have_text('Search')
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    expect(intent.locator('[data-intent-group=intent] [data-tip-el]')).to_have_attribute('aria-hidden', 'true')
    intent.locator('[data-reset-counts]').click()
    buttons.nth(2).hover()
    page.wait_for_timeout(80)
    page.mouse.move(1, 1)
    page.wait_for_timeout(500)
    expect(intent.locator('[data-count=intent]')).to_have_text('0')
    for mode in ('instant', 'intent'):
        intent.locator(f'[data-intent-group={mode}] [data-tip]').first.focus()
        expect(intent.locator(f'[data-intent-group={mode}] [data-tip-el]')).to_have_attribute('aria-hidden', 'false')
        page.keyboard.press('Escape')


def easing(page, base, is_reduced):
    ready(page, base, 'guide/easing.html')
    comparison = demo(page, 'linear-vs-eased')
    center(page, comparison)
    comparison.locator('[data-toggle]').click()
    expect(comparison).to_have_attribute('data-running', 'false')
    frozen(page, comparison.locator('.ease-card').first)
    comparison.locator('[data-toggle]').click()
    offscreen(page, comparison)
    expect(comparison).to_have_attribute('data-running', 'false')
    center(page, comparison)
    if not is_reduced:
        expect(comparison).to_have_attribute('data-running', 'true')
        page.emulate_media(reduced_motion='reduce')
        expect(comparison).to_have_attribute('data-running', 'false')
        frozen(page, comparison.locator('.ease-card').first)
        page.emulate_media(reduced_motion='no-preference')

    gallery = demo(page, 'easing-gallery')
    center(page, gallery)
    expect(gallery.locator('.ecard')).to_have_count(15)
    gallery.locator('[data-play]').click()
    gallery.locator('[data-filter=inout]').click()
    expect(gallery.locator('.ecard:not([hidden])')).to_have_count(3)
    expect(gallery.locator('.ecard.is-playing')).to_have_count(0)
    gallery.locator('.ecard:not([hidden])').first.focus()
    gallery.locator('[data-filter=all]').focus()
    expect(gallery.locator('.ecard.is-playing')).to_have_count(0)
    gallery.locator('[data-filter=all]').click()
    gallery.locator('[data-play]').click()
    offscreen(page, gallery)
    expect(gallery).to_have_attribute('data-running', 'false')
    expect(gallery.locator('.ecard.is-playing')).to_have_count(0)

    direction = demo(page, 'direction')
    center(page, direction)
    direction.locator('[data-play]').evaluate('el => { el.click(); el.click(); }')
    reduce(page, True)
    assert direction.evaluate('el => el.getAnimations({subtree:true}).length') == 0
    page.wait_for_timeout(1800)
    assert direction.locator('[data-action=exit] .dcard').evaluate_all('(els) => els.every(el => +getComputedStyle(el).opacity === 0)')
    direction.locator('[data-play]').click()
    if not is_reduced:
        reduce(page, False)

    editor = page.locator('[data-bezier]')
    editor.locator('[data-preset=snap]').click()
    page.wait_for_timeout(800)
    handle = editor.locator('[data-handle="0"]')
    handle.focus()
    before = editor.locator('[data-bezier-code]').text_content()
    page.keyboard.press('ArrowLeft')
    assert editor.locator('[data-bezier-code]').text_content() != before
    copy_fallback(page, editor.locator('[data-copy-code]'))

    builder = demo(page, 'linear-builder')
    center(page, builder)
    builder.locator('[data-lb-preset=bounce]').click()
    value(builder.locator('[data-lb-samples]'), 8, change=True)
    assert builder.locator('[data-lb-code]').text_content().startswith('linear(')
    copy_fallback(page, builder.locator('[data-lb-copy]'))
    builder.locator('[data-play]').click()
    offscreen(page, builder)
    expect(builder).to_have_attribute('data-running', 'false')
    frozen(page, builder.locator('[data-lb-box]'))
    center(page, builder)
    builder.locator('[data-play]').click()
    reduce(page, True)
    expect(builder).to_have_attribute('data-running', 'false')
    frozen(page, builder.locator('[data-lb-box]'))
    if not is_reduced:
        reduce(page, False)

    steps = demo(page, 'steps')
    center(page, steps)
    steps.locator('[data-play]').click()
    steps.locator('[data-clock-toggle]').click()
    expect(steps).to_have_attribute('data-clock-paused', 'true')
    frozen(page, steps.locator('.clock__hand--steps'))
    steps.locator('[data-clock-toggle]').click()
    offscreen(page, steps)
    frozen(page, steps.locator('.clock__hand--steps'))
    center(page, steps)
    steps.locator('[data-play]').click()
    page.wait_for_timeout(3000)
    assert steps.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), 'retained ruler endpoint overflows'
    assert steps.locator('.tw__text').text_content() == 'Motion is a design decision.'
    assert len(steps.locator('.tw__text').text_content()) == len('Motion is a design decision.')
    if not is_reduced:
        assert 'steps(28' in steps.locator('.tw__text').evaluate('el => getComputedStyle(el).animationTimingFunction')
    steps.locator('[data-play]').click()
    if not is_reduced:
        assert steps.locator('.tw__text').evaluate('el => el.getBoundingClientRect().width') < 200
    reduce(page, True)
    frozen(page, steps.locator('.tw__text'), 'el => el.getBoundingClientRect().width')
    if not is_reduced:
        reduce(page, False)

    tokens = demo(page, 'token-playground')
    center(page, tokens)
    tokens.locator('[data-token=overshoot]').click()
    expect(tokens.locator('[data-token-toggle]')).to_have_attribute('aria-expanded', 'true')
    assert not tokens.locator('[data-token-menu]').evaluate('el => el.inert')
    tokens.evaluate('el => { el.querySelector("[data-token=enter]").click(); el.querySelector("[data-token-toggle]").click(); }')
    page.wait_for_timeout(200)
    expect(tokens.locator('[data-token-toggle]')).to_have_attribute('aria-expanded', 'false')
    expect(tokens.locator('[data-token-menu]')).to_have_attribute('aria-hidden', 'true')
    assert tokens.locator('[data-token-menu]').evaluate('el => el.inert')
    tokens.locator('[data-dur=long]').click()
    reduce(page, True)
    assert tokens.locator('[data-token-menu]').evaluate('el => el.getAnimations({subtree:true}).length') == 0
    page.keyboard.press('Escape')
    expect(tokens.locator('[data-token-toggle]')).to_be_focused()
    expect(tokens.locator('[data-token-menu]')).to_have_attribute('aria-hidden', 'true')
    if not is_reduced:
        reduce(page, False)


def reference(page, base):
    ready(page, base, 'guide/cheatsheet.html')
    assert page.locator('[data-token-grid] path').count() >= 8
    assert page.locator('[data-preset-grid] .preset-card').count() > 0
    search = page.locator('[data-glossary-search]')
    search.fill('damping')
    assert 0 < page.locator('.glossary__item:not([hidden])').count() < 36
    assert page.locator('.glossary__item mark').count() > 0
    search.fill('unfindable-kinetic-term')
    expect(page.locator('[data-glossary-empty]')).to_be_visible()
    expect(page.locator('.glossary__item:not([hidden])')).to_have_count(0)
    search.fill('')
    expect(page.locator('.glossary__item:not([hidden])')).to_have_count(36)
    expect(page.locator('[data-glossary-empty]')).to_be_hidden()
    before = page.evaluate('JSON.stringify({...localStorage})')
    page.locator('[data-ship-checklist] label').first.click()
    expect(page.locator('[data-ship-count]')).to_have_text('1')
    assert page.evaluate('JSON.stringify({...localStorage})') != before
    page.reload()
    expect(page.locator('[data-ship-checklist] input').first).to_be_checked()
    page.locator('[data-ship-reset]').click()
    expect(page.locator('[data-ship-count]')).to_have_text('0')
    page.reload()
    expect(page.locator('[data-ship-checklist] input:checked')).to_have_count(0)


def no_js(page, base):
    for path in PAGES:
        response = page.goto(urljoin(base, path))
        assert response.status == 200
        no_overflow(page)
        chapter = Path(path).stem if path.startswith('guide/') else None
        if chapter in CHAPTERS:
            assert page.locator('[data-lesson]').count() == CHAPTERS[chapter][0]
            assert page.locator('.lesson code[data-lang]').count() >= CHAPTERS[chapter][0]
            # Early static footer/breadcrumb links are the no-JS curriculum route.
            expect(page.locator('.guide-footer a[href="index.html"]')).to_be_visible()
            snippet = page.locator('details.snippet').first
            snippet.locator('summary').click()
            expect(snippet.locator('code')).to_be_visible()
        if path == 'index.html':
            expect(page.locator('#field-guide [data-chapter-row]')).to_have_count(9)
            for note in page.locator('[data-notes]').all():
                expect(note.locator('.notes__toggle')).to_be_hidden()
                expect(note.locator('.notes__list')).to_be_visible()
                assert note.locator('li').count() == 3
        if path == 'guide/index.html':
            expect(page.locator('[data-chapter-row]')).to_have_count(9)
        if path.endswith('cheatsheet.html'):
            expect(page.locator('.glossary__item')).to_have_count(36)
            expect(page.locator('[data-ship-checklist] input')).to_have_count(10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:8080/')
    parser.add_argument('--browser', choices=('chromium', 'firefox', 'webkit'), default='chromium')
    parser.add_argument('--shots', type=Path)
    args = parser.parse_args()
    base = args.url.rstrip('/') + '/'
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as pw:
        browser = getattr(pw, args.browser).launch()
        def context(**options):
            ctx = browser.new_context(**options)
            ctx.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(status=200, content_type='text/css', body=''))
            ctx.add_init_script(f'window.siteBase = {base!r};')
            page = ctx.new_page()
            page.on('pageerror', lambda error: errors.append(f'{page.url}: {error}'))
            page.on('console', lambda message: errors.append(f'{page.url}: {message.text}') if message.type == 'error' else None)
            page.on('response', lambda response: errors.append(f'HTTP {response.status}: {response.url}') if response.status >= 400 and response.url.startswith(base) else None)
            return ctx, page
        try:
            for width in (1440, 390):
                for reduced in (False, True):
                    ctx, page = context(viewport={'width': width, 'height': 900}, reduced_motion='reduce' if reduced else 'no-preference', has_touch=width < 500)
                    entries(page, base, args.shots, f'{width}-{reduced}')
                    ctx.close()
            ctx, page = context(viewport={'width': 1440, 'height': 900})
            ready(page, base, 'index.html')
            for width in (1081, 1200, 1440, 390, 320):
                page.set_viewport_size({'width': width, 'height': 900})
                header_fit(page)
                assert page.locator('[data-ball=linear]').evaluate('''ball => {
                    const rail = ball.parentElement;
                    const expected = Math.max(0, rail.clientWidth - ball.offsetWidth - 12);
                    return Math.abs(new DOMMatrix(getComputedStyle(ball).transform).m41 - expected) < 1;
                }'''), 'offscreen preview must repaint at the new rail size'
            page.set_viewport_size({'width': 1440, 'height': 900})
            navigation(page, base)
            ctx.close()
            ctx, page = context(viewport={'width': 390, 'height': 844}, has_touch=True, reduced_motion='reduce')
            navigation(page, base, mobile=True)
            widgets_and_progress(page, base)
            reference(page, base)
            ctx.close()
            for reduced in (False, True):
                ctx, page = context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce' if reduced else 'no-preference')
                timing(page, base, reduced)
                easing(page, base, reduced)
                ctx.close()
            ctx, page = context(viewport={'width': 1200, 'height': 900})
            ctx.add_init_script('const supports = CSS.supports.bind(CSS); CSS.supports = (...args) => args.some(v => String(v).includes("linear(")) ? false : supports(...args);')
            ready(page, base, 'guide/easing.html')
            builder = demo(page, 'linear-builder')
            center(page, builder)
            expect(builder.locator('[data-lb-fallback]')).to_be_visible()
            builder.locator('[data-play]').click()
            expect(builder).to_have_attribute('data-running', 'true')
            offscreen(page, builder)
            expect(builder).to_have_attribute('data-running', 'false')
            frozen(page, builder.locator('[data-lb-box]'))
            center(page, builder)
            builder.locator('[data-play]').click()
            page.emulate_media(reduced_motion='reduce')
            expect(builder).to_have_attribute('data-running', 'false')
            frozen(page, builder.locator('[data-lb-box]'))
            ctx.close()
            ctx, page = context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
            ctx.add_init_script('Object.defineProperty(window,"localStorage",{configurable:true,get(){throw new DOMException("Blocked for test","SecurityError")}});')
            ready(page, base, 'guide/timing.html')
            page.locator('[data-complete]').click()
            expect(page.locator('[data-complete]')).to_have_attribute('aria-pressed', 'true')
            ready(page, base, 'index.html')
            expect(page.locator('[data-overall-pct]')).to_have_text('0')
            ctx.close()
            ctx, page = context(viewport={'width': 320, 'height': 844}, reduced_motion='no-preference')
            ready(page, base, 'guide/index.html')
            label = page.locator('.gi-hero [data-scramble]')
            expect(label.locator('.sr-only')).to_have_text('Kinetic — Field guide')
            expect(label.locator('.scramble-text')).to_have_attribute('aria-hidden', 'true')
            for _ in range(3):
                label.hover()
                for _ in range(8):
                    page.wait_for_timeout(65)
                    no_overflow(page)
                    assert label.evaluate('el => el.getBoundingClientRect().right <= document.documentElement.clientWidth'), 'scramble label widened its container'
                page.mouse.move(1, 1)
            ctx.close()
            ctx, page = context(viewport={'width': 320, 'height': 844}, reduced_motion='reduce')
            entries(page, base, None, '320')
            ctx.close()
            ctx, page = context(viewport={'width': 320, 'height': 844}, java_script_enabled=False)
            no_js(page, base)
            ctx.close()
            assert not errors, '\n'.join(errors)
            print('Global entries, 63 study structures, early lifecycles, navigation, progress, reference and no-JS checks completed.')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
