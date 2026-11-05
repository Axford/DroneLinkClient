// Compile and type-check the actual frontend codec, without copying its implementation.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
module.exports = async function loadCodec() {
  const source = path.resolve(__dirname, '../src/dronelink/DroneLinkMsg.ts');
  const options = {target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,
    moduleResolution:ts.ModuleResolutionKind.NodeJs,strict:true,skipLibCheck:true,
    types:[],noEmit:true,lib:['lib.es2020.d.ts','lib.dom.d.ts']};
  const program = ts.createProgram([source], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'
  }));
  const output = ts.transpileModule(fs.readFileSync(source,'utf8'), {compilerOptions:options}).outputText;
  const directory = path.resolve(__dirname, '../node_modules/.cache/protocol-tests');
  fs.mkdirSync(directory,{recursive:true});
  const destination = path.join(directory,'DroneLinkMsg.mjs');
  fs.writeFileSync(destination,output);
  return import(pathToFileURL(destination).href);
};
