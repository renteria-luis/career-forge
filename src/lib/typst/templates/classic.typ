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

#set document(
  title: data.name + " — Resume",
  author: data.name,
)

#set page(
  paper: "a4",
  margin: page-opts.margin * 1mm,
)

#set text(
  font: page-opts.font,
  size: page-opts.size * 1pt,
  lang: "en",
  // Hyphenation splits technical terms in ways that read as typos on a resume.
  hyphenate: false,
)

#set par(justify: false, leading: 0.62em * d)

#show link: it => underline(offset: 2pt, it)

// Bullets are set tight: a resume is scanned, not read.
#set list(marker: [•], indent: 0pt, body-indent: 6pt, spacing: 0.5em * d)

#let section-heading(title) = {
  block(above: 1.15em * d, below: 0.55em * d)[
    #text(size: 0.95em, weight: 700, tracking: 0.06em, upper(title))
    #v(-0.42em)
    #line(length: 100%, stroke: 0.5pt + luma(150))
  ]
}

#let entry(item) = {
  block(above: 0.72em * d, below: 0em, breakable: false)[
    #if "title" in item or "meta" in item [
      #text(weight: 700, item.at("title", default: ""))
      #h(1fr)
      #text(size: 0.92em, item.at("meta", default: ""))
    ]
    #if "subtitle" in item [
      #linebreak()
      #text(style: "italic", item.subtitle)
    ]
  ]
  if "summary" in item {
    block(above: 0.3em * d, below: 0em, item.summary)
  }
  if "highlights" in item {
    block(above: 0.3em * d, below: 0em, list(..item.highlights))
  }
  if "keywords" in item {
    block(above: 0.3em * d, below: 0em, text(
      size: 0.94em,
      item.keywords.join(", "),
    ))
  }
}

#let inline-entry(item) = {
  block(above: 0.32em * d, below: 0em)[
    #if "title" in item [#text(weight: 700, item.title)#if "keywords" in item [: ]]
    #if "keywords" in item [#item.keywords.join(", ")]
  ]
}

// --- header -----------------------------------------------------------------
#block(below: 0.2em)[
  #text(size: 1.95em, weight: 700, data.name)
]

#if "headline" in data and data.headline != none [
  #block(above: 0.3em * d, below: 0em)[
    #text(size: 1.02em, data.headline)
  ]
]

#if data.contacts.len() > 0 [
  #block(above: 0.42em * d, below: 0em)[
    #text(size: 0.92em, data.contacts.join("  ·  "))
  ]
]

// --- sections ---------------------------------------------------------------
// The contact line is small type; without this the first rule crowds it.
#v(0.3em * d)

#for section in data.sections [
  #section-heading(section.title)
  #if section.layout == "prose" [
    #section.at("body", default: "")
  ] else if section.layout == "inline" [
    #for item in section.entries [#inline-entry(item)]
  ] else [
    #for item in section.entries [#entry(item)]
  ]
]
