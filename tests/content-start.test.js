'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const colors = require('../content/colors.js');

test('content script inicia mesmo quando documentElement não existe no document_start', async () => {
  const callbacks = new Map();
  const root = {
    nodeType: 1, tagName: 'HTML', isConnected: true, attributes:{},
    style: {getPropertyValue: () => '', getPropertyPriority: () => '', setProperty: () => {}, removeProperty: () => {}},
    children: [],
    appendChild(child) {this.children.push(child);},
    setAttribute(key, value) {this.attributes[key] = value;},
    removeAttribute(key) {delete this.attributes[key];},
    closest() {return null;}
  };
  const document = {
    documentElement: null,
    addEventListener(event, callback) {callbacks.set(event, callback);},
    createElement(tag) {return {tagName:tag.toUpperCase(), remove() {}, id:'', textContent:''};},
    createTreeWalker(element) {return {nextNode: () => null};}
  };
  const chrome = {storage:{local:{get:async defaults => defaults},onChanged:{addListener:()=>{}}}};
  const sandbox = {
    globalThis:null, chrome, document, location:{protocol:'https:', hostname:'example.com'},
    Node: {ELEMENT_NODE:1}, NodeFilter:{SHOW_ELEMENT:1},
    MutationObserver:class {observe(){} disconnect(){}},
    getComputedStyle:()=>({backgroundColor:'rgba(0,0,0,0)',color:'rgb(230,230,230)'}),
    requestIdleCallback:()=>{}, setTimeout:()=>{}
  };
  sandbox.globalThis = sandbox;
  sandbox.DarkExtensionColors = colors;
  const script = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');
  vm.runInNewContext(script, sandbox);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(typeof callbacks.get('readystatechange'), 'function');
  document.documentElement = root;
  callbacks.get('readystatechange')();
  assert.equal(root.attributes['data-extensao-dark'], 'on');
});
