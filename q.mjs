import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler'
const c = NodeCompiler.create({ fontArgs: [{ fontPaths: ['./fonts/static'] }] })
const src = `
#set page(width: 120mm, height: 200mm, margin: 10mm)
#set text(font: "Lato", size: 10pt)

#let mark(id) = [#metadata(id)<cf-mark>]

#mark("section.work")
= Experience
#mark("work.0")
*Senior Engineer* \\ Acme \\ - did things
#mark("work.1")
*Junior Engineer* \\ Beta \\ - did other things
#mark("section.education")
= Education
#mark("education.0")
BSc

#context [
  #metadata(query(<cf-mark>).map(m => (
    id: m.value,
    page: m.location().page(),
    y: m.location().position().y / 1pt,
    x: m.location().position().x / 1pt,
  )))<cf-layout>
]
`
const res = c.compile({ mainFileContent: src })
if (!res.result) {
  console.log('COMPILE FAILED')
  process.exit(1)
}
const out = c.query(res.result, { selector: '<cf-layout>', field: 'value' })
console.log(JSON.stringify(out, null, 1).slice(0, 900))
