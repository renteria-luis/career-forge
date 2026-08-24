import type { Profile } from './profile'
import { DEFAULT_SECTIONS, type ResumeDocument } from './document'

/**
 * A profile that exercises the awkward cases on purpose: a current role with no
 * end date, a year-only date, an entry missing its employer, an accented name,
 * and a skill keyword that appears nowhere in the work history. Templates and
 * parsers that survive this fixture survive real user data.
 */
export const sampleProfile: Profile = {
  basics: {
    name: 'Ana Ruiz Peña',
    label: 'ML Engineer | Data Scientist',
    email: 'ana@example.com',
    phone: '+51 999 888 777',
    url: 'https://example.com',
    summary:
      'Machine learning engineer with four years building retrieval and ranking systems in production. Comfortable owning a model from dataset to on-call rotation.',
    location: { city: 'Lima', countryCode: 'PE' },
    profiles: [{ network: 'GitHub', username: 'anaruiz', url: 'https://github.com/anaruiz' }],
  },
  work: [
    {
      name: 'Nomad Analytics',
      position: 'Senior ML Engineer',
      location: 'Toronto, ON',
      arrangement: 'remote',
      startDate: '2023-02',
      // No endDate: this is the current role, per the JSON Resume convention.
      highlights: [
        'Cut retrieval latency from 240ms to 45ms by replacing the vector index and batching embedding calls.',
        'Owned the ranking service through two on-call rotations at 99.95% availability.',
      ],
    },
    {
      name: 'Retail Grid',
      position: 'Data Scientist',
      startDate: '2021',
      endDate: '2023-01',
      highlights: ['Built the demand forecast used for weekly purchasing across 40 stores.'],
    },
    {
      // Employer forgotten during import. Must not break rendering.
      position: 'Research Assistant',
      startDate: '2020-03',
      endDate: '2021-01',
    },
  ],
  education: [
    {
      institution: 'Universidad Nacional de Ingeniería',
      location: 'Lima, Peru',
      area: 'Computer Science',
      studyType: 'BSc',
      startDate: '2016',
      endDate: '2020',
    },
  ],
  projects: [
    {
      name: 'tiny-rerank',
      description: 'A cross-encoder reranker small enough to run on CPU.',
      keywords: ['PyTorch', 'ONNX'],
      url: 'https://github.com/anaruiz/tiny-rerank',
      highlights: ['Matches the base model within 2% nDCG at a twentieth of the cost.'],
    },
  ],
  skills: [
    { name: 'Machine learning', keywords: ['PyTorch', 'scikit-learn'] },
    // Kubernetes appears in no role or project — the smoke detector should flag it.
    { name: 'Infrastructure', keywords: ['Kubernetes'] },
  ],
  languages: [
    { language: 'Spanish', fluency: 'Native' },
    { language: 'English', fluency: 'Professional' },
  ],
}

export const sampleDocument: ResumeDocument = {
  id: 'sample',
  name: 'Sample',
  template: 'classic',
  locale: 'en',
  typography: { paper: 'letter', font: 'carlito', size: 10, margin: 30, density: 0.9 },
  options: {
    maxPages: 1,
    headline: 'ML Engineer | Data Scientist',
    showEmail: true,
    showPhone: true,
    showLocation: true,
    showWebsite: true,
    showGithub: true,
    showLinkedin: true,
  },
  // Languages is set beyond the defaults on purpose: it is the one section
  // with the joined layout, so without it here nothing compiled in a test ever
  // exercised that layout or the parser that has to read it back.
  sections: [...DEFAULT_SECTIONS, { kind: 'standard', id: 'languages', visible: true }],
}
