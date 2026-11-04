import { parse } from 'acorn';

// Extract literals only. Never import, evaluate, or construct a function from scene source.
export function parseMetadata(code) {
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const constants = new Map();
  function inspect(node) {
    if (!node || typeof node !== 'object') return;
    if (['ImportExpression','ImportDeclaration'].includes(node.type) || node.type === 'CallExpression' && node.callee?.name === 'require') throw new Error('Scene modules must not import anything; use api.THREE and api.kit');
    for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(inspect); else if (child && typeof child === 'object') inspect(child);
  }
  inspect(ast);
  function value(n) {
    if (!n) return undefined;
    if (n.type === 'Literal') return n.value;
    if (n.type === 'Identifier' && constants.has(n.name)) return constants.get(n.name);
    if (n.type === 'UnaryExpression' && ['-', '+'].includes(n.operator)) return n.operator === '-' ? -value(n.argument) : +value(n.argument);
    if (n.type === 'ArrayExpression') return n.elements.flatMap(x => x.type === 'SpreadElement' ? value(x.argument) : [value(x)]);
    if (n.type === 'ObjectExpression') return Object.fromEntries(n.properties.map(p => {
      if (p.type !== 'Property' || p.computed || p.kind !== 'init') throw new Error('Metadata must contain plain properties');
      return [p.key.name || p.key.value, ['create', 'assets'].includes(p.key.name) ? (['FunctionExpression','ArrowFunctionExpression'].includes(p.value.type) ? 'function' : null) : value(p.value)];
    }));
    throw new Error('Metadata must use literal values or constant arrays');
  }
  for (const n of ast.body) {
    if (n.type === 'VariableDeclaration' && n.kind === 'const') {
      for (const d of n.declarations) { try { constants.set(d.id.name, value(d.init)); } catch { /* helper constants are not metadata */ } }
    }
  }
  const node = ast.body.find(n => n.type === 'ExportDefaultDeclaration');
  if (!node) throw new Error('No default export');
  const data = value(node.declaration);
  if (data.create !== 'function') throw new Error('Default export needs create(api)');
  return data;
}
