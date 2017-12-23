'use strict'

const chai = require('chai'),
  expect = chai.expect,
  chaiSubset = require('chai-subset')

chai.use(chaiSubset)

const Cls = require('../index'),
  lib = require('./_lib')

describe('setOptions', function () {
  it('should return the default options', function () {
    const cls = new Cls()
    expect(cls.options).to.containSubset({
      hosts: ['localhost:9200'],
      index: 'test',
      type: 'doc',
    })
  })

  it('should return options with custom hosts', function () {
    const cls = new Cls({ 
      hosts: ['myhost:9200'],
    })
    expect(cls.options).to.containSubset({
      hosts: ['myhost:9200'],
    })
  })

  it('should return options with custom index', function () {
    const cls = new Cls({ 
      index: 'myindex',
    })
    expect(cls.options).to.include({
      index: 'myindex',
    })
  })

  it('should return options with custom type', function () {
    const cls = new Cls({ 
      type: 'mytype',
    })
    expect(cls.options).to.include({
      type: 'mytype',
    })
  })

})


