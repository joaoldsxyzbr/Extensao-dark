'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../content/colors.js');
const bright=colors.parseColor('rgb(255, 255, 255)');
const darkText=colors.parseColor('rgb(16, 18, 20)');
const context=()=>({
  action:'convert',kind:'surface',control:false,selected:false,disabled:false,
  nativeDark:false,backgroundImage:false,masked:false,clipped:false,
  pseudo:false,translucent:false
});
const geometry=()=>({
  width:1000,height:750,viewportWidth:1100,viewportHeight:900,
  position:'static',opacity:1
});
test('P14 white canvas: recover an opaque large light surface with dark text',()=>{
  assert.equal(colors.shouldRecoverBrightCanvas(bright,darkText,context(),geometry()),true);
  assert.ok(colors.luminance(colors.parseColor(colors.mapBackground(bright,'deep')))<.20);
});
test('P14 white canvas: no forced conversion of graphics, controls or native dark',()=>{
  for(const edit of [
    {kind:'graphic'},{action:'preserve'},{control:true},{selected:true},
    {disabled:true},{nativeDark:true},{backgroundImage:true},
    {masked:true},{clipped:true},{pseudo:true},{translucent:true}
  ])assert.equal(colors.shouldRecoverBrightCanvas(bright,darkText,
    {...context(),...edit},geometry()),false,JSON.stringify(edit));
});
test('P14 white canvas: no forced conversion of overlays, small cards or transparent colors',()=>{
  for(const edit of [
    {width:120},{height:80},{viewportWidth:0},{viewportHeight:0},
    {position:'fixed'},{position:'sticky'},{opacity:.8}
  ])assert.equal(colors.shouldRecoverBrightCanvas(bright,darkText,context(),
    {...geometry(),...edit}),false,JSON.stringify(edit));
  assert.equal(colors.shouldRecoverBrightCanvas(
    colors.parseColor('rgba(255,255,255,.8)'),darkText,context(),geometry()),false);
  assert.equal(colors.shouldRecoverBrightCanvas(
    colors.parseColor('rgb(22,22,22)'),darkText,context(),geometry()),false);
  assert.equal(colors.shouldRecoverBrightCanvas(
    bright,colors.parseColor('rgb(245,245,245)'),context(),geometry()),false);
  assert.equal(colors.shouldRecoverBrightCanvas(
    bright,colors.parseColor('rgb(245,245,245)'),context(),geometry()),false);
});

test('P14 white canvas: permit bright foreground on huge white canvas while protecting complex surfaces',()=>{
  const lightText=colors.parseColor('rgb(240, 240, 240)');
  assert.equal(colors.shouldRecoverBrightCanvas(bright,lightText,context(),
    {...geometry(),ancestorLuminance:.07}),true);
  // A bright foreground on white is itself an illegible pairing: conversion
  // improves contrast regardless of whether the ancestor is light or dark.
  assert.equal(colors.shouldRecoverBrightCanvas(bright,lightText,context(),
    {...geometry(),ancestorLuminance:.75}),true);
  assert.equal(colors.shouldRecoverBrightCanvas(bright,lightText,context(),
    geometry()),true);
  assert.equal(colors.shouldRecoverBrightCanvas(bright,lightText,
    {...context(),backgroundImage:true},
    {...geometry(),ancestorLuminance:.07}),false);
});
