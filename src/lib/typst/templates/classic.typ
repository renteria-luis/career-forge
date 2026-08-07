// Classic resume template.
//
// Reads the render model from sys.inputs and draws it. Every decision about
// what appears and in what order was already made in TypeScript — this file
// only typesets.
//
// Constraints that are not style preferences:
//   - One column. Multi-column layouts interleave when an ATS extracts text,
//     which turns a good resume into scrambled input.
//   - Nothing in the page header or footer. Extraction frequently drops both.
//   - No icons or images for contact details. They extract as nothing.
//   - Real text throughout, so the PDF carries a text layer.

#let data = json(bytes(sys.inputs.at("model")))
#let page-opts = data.page
#let d = page-opts.density

// --- spacing scale ----------------------------------------------------------
// Five values, and nothing in this file may invent a sixth. Every gap on the
// page is one of these, which is what makes the rhythm uniform: two sections
// are separated by the same distance wherever they appear, and a wrapped line
// inside a bullet sits exactly as far from its neighbour as one inside the
// summary.
//
// Blocks set only `above` and leave `below` at zero. Typst collapses adjacent
// spacing to the larger of the two, so controlling one side keeps every gap
// decided by exactly one rule.

// The values grow strictly: a reader separates content by comparing gaps, so
// two lines of one bullet must sit closer than two bullets, which must sit
// closer than two jobs, which must sit closer than two sections. Measured
// baseline to baseline at the default size these come out near 13, 15, 18 and
// 23 points. spacing.test.ts asserts the ordering against the rendered page.

/** Between lines of the same paragraph. The only leading in the document. */
#let leading = 0.62em * d
/** Between paragraphs and between bullets inside one entry. */
#let gap-paragraph = 0.72em * d
/** Between one entry and the next within a section. */
#let gap-entry = 1em * d
/** Between a section heading and the first line under it. */
#let gap-heading = 0.62em * d
/**
 * Between the heading's words and the rule under them. Deliberately tight: the
 * rule belongs to the heading, and set closer to the content than to its own
 * title it reads as a divider floating loose above the text.
 */
#let gap-rule = 0.1em * d
/** Between the last line of a section and the next section's heading. */
#let gap-section = 1.5em * d

#set document(title: data.name + " — Resume", author: data.name)

#set page(
  paper: "a4",
  // The model carries CSS pixels; 1px is exactly 0.75pt.
  margin: page-opts.margin * 0.75pt,
)

#set text(
  font: page-opts.font,
  size: page-opts.size * 1pt,
  lang: "en",
  // Hyphenation splits technical terms in ways that read as typos on a resume.
  hyphenate: false,
)

#set par(justify: false, leading: leading, spacing: gap-paragraph)

// Links look like links. A reader has to be able to tell that the portfolio
// address is clickable, and the same styling on screen and on paper is what
// people already recognise from every other document.
#let link-blue = rgb("#1155cc")
#show link: it => text(fill: link-blue, underline(offset: 1.5pt, it))

// `tight: false` makes items use paragraph spacing, so the gap between two
// bullets matches the gap between two paragraphs instead of being its own value.
#set list(marker: [•], indent: 0pt, body-indent: 6pt, tight: false, spacing: gap-paragraph)

// The rule is positioned by its own value rather than by pulling it back up
// with a negative offset, which was landing it on the descenders of the words.
#let section-heading(title) = {
  block(above: gap-section, below: 0pt, breakable: false)[
    // Paragraph spacing would otherwise be added between the title, the rule
    // and the gap below it, on top of the values set here.
    #set par(spacing: 0pt)
    #text(size: 0.95em, weight: 700, tracking: 0.06em, upper(title))
    #v(gap-rule, weak: false)
    #line(length: 100%, stroke: 0.5pt + luma(160))
    #v(gap-heading, weak: false)
  ]
}

#let entry(item, first) = {
  block(above: if first { 0pt } else { gap-entry }, below: 0pt, breakable: false)[
    #if "title" in item or "meta" in item [
      #text(weight: 700, item.at("title", default: ""))
      #h(1fr)
      #text(size: 0.92em, weight: 700, item.at("meta", default: ""))
    ]
    #if "subtitle" in item [
      #linebreak()
      #text(style: "italic", item.subtitle)
    ]
    // The stack a project was built with belongs with its name, not trailing
    // after the bullets where it reads as an afterthought.
    #if "keywords" in item [
      #linebreak()
      #text(style: "italic", size: 0.94em, item.keywords.join(", "))
    ]
    #if "url" in item and item.url != none [
      #linebreak()
      #text(size: 0.92em, link(item.url))
    ]
  ]
  if "summary" in item {
    block(above: gap-paragraph, below: 0pt, item.summary)
  }
  if "highlights" in item {
    block(above: gap-paragraph, below: 0pt, list(..item.highlights))
  }
}

#let inline-entry(item, first) = {
  let label = if "title" in item {
    text(weight: 700, if "keywords" in item { item.title + ": " } else { item.title })
  }
  let body = if "keywords" in item { item.keywords.join(", ") }
  block(above: if first { 0pt } else { gap-paragraph }, below: 0pt)[#label#body]
}

// --- header -----------------------------------------------------------------
// Each contact detail prints its label and links to its href when it has one,
// so "jamessmith.dev" is what appears and the full address is what opens.
//
// Every item is boxed. A box will not break across lines, so a long address
// moves to the next line whole instead of being split down the middle — which
// is both unreadable and impossible to retype.
#let contact-item(item) = box(
  if "href" in item and item.href != none { link(item.href, item.label) } else { item.label },
)

#align(center)[
  #block(below: 0pt)[#text(size: 1.95em, weight: 700, data.name)]

  #if "headline" in data and data.headline != none [
    #block(above: gap-paragraph, below: 0pt)[#text(size: 1.02em, data.headline)]
  ]

  #if data.contacts.len() > 0 [
    #block(above: gap-paragraph, below: 0pt)[
      #text(
        size: 0.92em,
        data.contacts.map(contact-item).join([#h(0.3em)#text(fill: luma(140))[|]#h(0.3em)]),
      )
    ]
  ]
]

// --- sections ---------------------------------------------------------------
#for section in data.sections [
  #section-heading(section.title)
  #if section.layout == "prose" [
    #block(above: gap-heading, below: 0pt, section.at("body", default: ""))
  ] else if section.layout == "inline" [
    #for (i, item) in section.entries.enumerate() [#inline-entry(item, i == 0)]
  ] else [
    #for (i, item) in section.entries.enumerate() [#entry(item, i == 0)]
  ]
]
