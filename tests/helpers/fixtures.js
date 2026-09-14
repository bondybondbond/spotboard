// DOM-builder helpers shared by tests — avoids passing raw HTML strings into .innerHTML
// (the functions under test do that internally; test fixtures build via the DOM API instead).
export function el(tag, text, children = []) {
  const node = document.createElement(tag)
  if (text != null) node.appendChild(document.createTextNode(text))
  children.forEach(c => node.appendChild(c))
  return node
}
