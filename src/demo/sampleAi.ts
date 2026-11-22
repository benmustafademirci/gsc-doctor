import type { AiInsights } from '../types.js';

/**
 * A hand-written example of the Gemini section, shown in `--demo` when no
 * GEMINI_API_KEY is set so people can see what the AI layer adds. The report
 * labels it clearly as a sample, not live output.
 */
export const DEMO_SAMPLE_AI: AiInsights = {
  model: 'sample',
  sample: true,
  summary:
    'Most of the drop comes from things outside the pages themselves: the summer camping checklist lost its seasonal ' +
    'demand and the GPS watch comparison dropped out of Google entirely. The fastest wins are pages that already rank ' +
    'near the top but are rarely clicked — the sleeping bag guide and the jacket comparison earn only a fraction of the ' +
    'clicks their positions should bring. Fixing those titles, restoring the GPS page and merging the overlapping ' +
    'boot-care articles should more than offset the seasonal dip.',
  highlights: [
    'Restore or redirect the GPS watch comparison — it went from steady traffic to zero impressions.',
    'Rewrite the sleeping bag guide’s title: it ranks in the top 5 but wins only about a third of the clicks it should.',
    'Refresh the trekking poles guide, which slipped from page one to page two.',
    'Merge the two boot-cleaning articles so one page can rank higher for “how to clean hiking boots”.',
    'Expect the summer camping checklist to recover in spring; update it before the season starts.',
  ],
  titleSuggestions: [
    {
      page: 'https://example.com/blog/how-to-choose-a-sleeping-bag/',
      titles: [
        'How to Choose a Sleeping Bag: Temperature Ratings Explained',
        'Choosing a Sleeping Bag: Warmth, Weight and Fit Made Simple',
      ],
      metaDescription:
        'Not sure which sleeping bag to buy? Learn how temperature ratings, insulation and shape work, and pick the right bag for your next trip.',
      rationale: 'The current title is generic and the description gives no reason to click.',
    },
    {
      page: 'https://example.com/blog/waterproof-vs-water-resistant-jackets/',
      titles: [
        'Waterproof vs Water-Resistant Jackets: What’s the Difference?',
        'Waterproof or Water-Resistant? How to Pick the Right Rain Jacket',
      ],
      metaDescription:
        'Waterproof and water-resistant jackets are not the same. See how ratings, seams and fabrics differ, and which one you need for rain or snow.',
      rationale: 'There is no meta description, so Google improvises the snippet.',
    },
    {
      page: 'https://example.com/category/hiking-boots/',
      titles: ['Hiking Boots for Men and Women | Example Outdoors', 'Shop Hiking Boots: Waterproof, Lightweight and Winter Styles'],
      metaDescription:
        'Compare waterproof, lightweight and winter hiking boots for men and women, with a size guide to help you find the right fit for the trail.',
      rationale: 'The title reads like an internal label rather than an answer to “hiking boots”.',
    },
    {
      page: 'https://example.com/blog/hydration-pack-vs-water-bottles/',
      titles: [
        'Hydration Pack vs Water Bottles: Which Is Better on the Trail?',
        'Hydration Pack or Bottles? Weight, Capacity and Comfort Compared',
      ],
      metaDescription:
        'Deciding between a hydration pack and water bottles? Compare weight, capacity, convenience and cleaning so you carry the right setup.',
      rationale: 'CTR halved at a stable ranking; a sharper promise can win back clicks from the answer box.',
    },
    {
      page: 'https://example.com/blog/blister-prevention-tips/',
      titles: ['How to Prevent Hiking Blisters: Socks, Fit and Lacing Tips', 'Blister Prevention for Hikers: Stop Blisters Before They Start'],
      metaDescription:
        'Stop blisters before they start. Learn how socks, boot fit, lacing and foot care keep your feet comfortable on long hikes.',
      rationale: '“Blisters | Blog” says nothing about prevention, the intent behind the query.',
    },
  ],
};
