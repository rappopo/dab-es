'use strict'

const elasticsearch = require('elasticsearch'),
  qbuilder = require('e3po')('client')._queryBuilder,
  Dab = require('@rappopo/dab')

class DabEs extends Dab {
  constructor (options) {
    super(options)
  }

  setOptions (options) {
    super.setOptions(this._.merge(this.options, {
      hosts: options.hosts || ['localhost:9200'],
      index: options.index || 'test',
      type: options.type || 'doc',
      apiVersion: options.apiVersion,
      options: options.options || {
        refresh: 'true'
      }
    }))
  }

  setClient (params) {
    if (this.client) return
    this.client = new elasticsearch.Client({
      hosts: this.options.hosts,
      apiVersion: this.options.apiVersion      
    })
  }

  find (params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    let limit = params.limit || this.options.limit,
      skip = ((params.page || 1) - 1) * limit,
      sort = params.sort
    return new Promise((resolve, reject) => {
      let query = qbuilder({})
      query.bool.filter = qbuilder({ query: params.query || {} })

      this.client.search({
        index: params.index || this.options.index,
        type: params.type || this.options.type,
        body: { 
          query: query,
          from: skip,
          size: limit,
          sort: sort
        },
      })
      .then(result => {
        let data = { success: true, data: [] }
        result.hits.hits.forEach((d, i) => {
          data.data.push(this.convertDoc(this._.merge(d._source, { _id: d._id })))
        })
        resolve(data)
      })
      .catch(reject)
    })
  }

  _findOne (id, params, callback) {
    this.client.get({
      index: params.index || this.options.index,
      type: params.type || this.options.type,
      id: id
    })
    .then(result => {
      callback({
        success: true,
        data: this._.merge(result._source, { _id: result._id })
      })          
    })
    .catch(err => {
      if (err.statusCode === 404)
        err = new Error('Not found')
      callback({
        success: false,
        err: err
      })
    })
  }

  findOne (id, params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      this._findOne(id, params, result => {
        if (!result.success)
          return reject(result.err)
        let data = {
          success: true,
          data: this.convertDoc(result.data)
        }
        resolve(data)
      })
    })
  }

  _create (body, params, callback) {
    let opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
      index: params.index || this.options.index,
      type: params.type || this.options.type
    })
    if (body._id) opt.id = body._id
    opt.body = this._.omit(body, ['_id'])
    this.client.create(opt)
    .then(data => {
      this._findOne(data._id, this._.pick(opt, ['index', 'type']), result => {
        callback(result)
      })
    })
    .catch(err => {
      callback({
        success: false,
        err: err
      })
    })
  }

  create (body, params) {
    [params, body] = this.sanitize(params, body)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      if (body._id) {
        this._findOne(body._id, params, result => {
          if (result.success) 
            return reject(new Error('Exists'))
          this._create(body, params, result => {
            if (!result.success)
              return reject(result.err)
            result.data = this.convertDoc(result.data)
            resolve(result)
          })
        })
      } else {
        this._create(body, params, result => {
          if (!result.success)
            return reject(result.err)
          result.data = this.convertDoc(result.data)
          resolve(result)
        })        
      }
    })
  }

  update (id, body, params) {
    [params, body] = this.sanitize(params, body)
    this.setClient(params)
    body = this._.omit(body, ['_id'])
    return new Promise((resolve, reject) => {
      this._findOne(id, params, result => {
        if (!result.success)
          return reject(result.err)
        let source = result.data,
          method = 'update', 
          opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
            index: params.index || this.options.index,
            type: params.type || this.options.type,
            id: id
          })
        if (params.fullReplace) {
          opt.body = body
          method = 'index'
        } else {
          opt.body = { doc: this._.merge(this._.omit(result.data, ['_id']), body) }
        }
        this.client[method](opt)
        .then(data => {
          this._findOne(id, this._.pick(opt, ['index', 'type']), result => {
            if (!result.success)
              return reject(result.err)
            let data = {
              success: true,
              data: this.convertDoc(result.data)
            }
            if (params.withSource)
              data.source = this.convertDoc(source)
            resolve(data)
          })
        })
        .catch(reject)
      })
    })
  }

  remove (id, params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      this._findOne(id, params, result => {
        if (!result.success)
          return reject(result.err)
        let source = result.data, 
          opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
            index: params.index || this.options.index,
            type: params.type || this.options.type,
            id: id
          })
        this.client.delete(opt)
        .then(result => {
          let data = { success: true }
          if (params.withSource)
            data.source = this.convertDoc(source)
          resolve(data)
        })
        .catch(reject)
      })
    })
  }

  bulkCreate (body, params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      if (!this._.isArray(body))
        return reject(new Error('Require array'))
      this._.each(body, (b, i) => {
        if (!b._id)
          b._id = this.uuid()
        body[i] = b
      })
      const keys = this._(body).map('_id').value()
      let opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
        index: params.index || this.options.index,
        type: params.type || this.options.type,
        body: {
          ids: keys
        },
        _source: false
      })

      this.client.mget(opt, (err, result) => {
        if (err)
          return reject(err)
        let info = result.docs,
          newBody = []
        this._.each(body, (b, i) => {
          newBody.push({ create: { _id: b._id }})
          newBody.push(this._.omit(b, ['_id']))
        })
        let opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
          index: params.index || this.options.index,
          type: params.type || this.options.type,
          body: newBody
        })
        this.client.bulk(opt, (err, result) => {
          if (err)
            return reject(err)
          let ok = 0, status = []
          this._.each(result.items, (r, i) => {
            let stat = { success: r.create.result === 'created' ? true : false }
            stat._id = r.create._id
            if (!stat.success)
              stat.message = info[i] && info[i].found ? 'Exists' : this._.upperFirst(r.create.result)
            else
              ok++
            status.push(stat)
          })
          let data = {
            success: true,
            stat: {
              ok: ok,
              fail: body.length - ok,
              total: body.length
            }
          }
          if (params.withDetail)
            data.detail = status
          resolve(data)
        })    
      })
    })
  }

  bulkUpdate (body, params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      if (!this._.isArray(body))
        return reject(new Error('Require array'))
      this._.each(body, (b, i) => {
        if (!b._id)
          b._id = this.uuid() // will likely to introduce 'not-found'
        body[i] = b
      })
      const keys = this._(body).map('_id').value()
      let opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
        index: params.index || this.options.index,
        type: params.type || this.options.type,
        body: {
          ids: keys
        },
        _source: false
      })

      this.client.mget(opt, (err, result) => {
        if (err)
          return reject(err)
        let info = result.docs,
          newBody = []
        this._.each(body, (b, i) => {
          newBody.push({ index: { _id: b._id }})
          newBody.push(this._.omit(b, ['_id']))
        })
        let opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
          index: params.index || this.options.index,
          type: params.type || this.options.type,
          body: newBody
        })
        this.client.bulk(opt, (err, result) => {
          if (err)
            return reject(err)
          let ok = 0, status = []
          this._.each(result.items, (r, i) => {
            let stat = { success: r.index.result === 'updated' ? true : false }
            stat._id = r.index._id
            if (!stat.success)
              stat.message = info[i] && !info[i].found ? 'Not found' : this._.upperFirst(r.index.result)
            else
              ok++
            status.push(stat)
          })
          let data = {
            success: true,
            stat: {
              ok: ok,
              fail: body.length - ok,
              total: body.length
            }
          }
          if (params.withDetail)
            data.detail = status
          resolve(data)
        })    
      })
    })
  }

  bulkRemove (body, params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      if (!this._.isArray(body))
        return reject(new Error('Require array'))
      this._.each(body, (b, i) => {
        body[i] = b || this.uuid()
      })
      let opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
        index: params.index || this.options.index,
        type: params.type || this.options.type,
        body: {
          ids: body
        },
        _source: false
      })

      this.client.mget(opt, (err, result) => {
        if (err)
          return reject(err)
        let info = result.docs,
          newBody = []
        this._.each(body, (b, i) => {
          newBody.push({ delete: { _id: b }})
        })
        let opt = this._.merge(params.options || this._.cloneDeep(this.options.options), {
          index: params.index || this.options.index,
          type: params.type || this.options.type,
          body: newBody
        })
        this.client.bulk(opt, (err, result) => {
          if (err)
            return reject(err)
          let ok = 0, status = []
          this._.each(result.items, (r, i) => {
            let stat = { success: r.delete.result === 'deleted' ? true : false }
            stat._id = r.delete._id
            if (!stat.success)
              stat.message = info[i] && !info[i].found ? 'Not found' : this._.upperFirst(r.delete.result)
            else
              ok++
            status.push(stat)
          })
          let data = {
            success: true,
            stat: {
              ok: ok,
              fail: body.length - ok,
              total: body.length
            }
          }
          if (params.withDetail)
            data.detail = status
          resolve(data)
        })    
      })
    })
  }

}

module.exports = DabEs