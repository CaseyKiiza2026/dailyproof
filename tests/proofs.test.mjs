import test from 'node:test';import assert from 'node:assert/strict';import {loadTypeScript} from './load-typescript.mjs';
const {validateProof}=loadTypeScript('lib/proofs.ts');
test('proof links reject executable URLs and embedded credentials',()=>{assert.throws(()=>validateProof('link','javascript:alert(1)'));assert.throws(()=>validateProof('link','https://user:password@example.com'));assert.throws(()=>validateProof('note',' '));assert.doesNotThrow(()=>validateProof('link','https://example.com/proof'));});
