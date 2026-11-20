// Header state: transparent over the hero, frosted once the hero's bottom edge passes under the bar.
const head = document.querySelector<HTMLElement>('.site-head')
const hero = document.getElementById('top')
if (head && hero) {
  new IntersectionObserver(([e]) => (head.dataset.state = e.isIntersecting ? 'hero' : 'solid'), {
    rootMargin: `-${head.offsetHeight}px 0px 0px 0px`,
    threshold: 0,
  }).observe(hero)
}
