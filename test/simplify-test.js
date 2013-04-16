var assert = require('assert'),
    api = require("../"),
    trace = api.trace;


function coordBuffersEqual(a, b) {
  var precision = 1e-9,
      bufLen = a.length;
  assert.equal(bufLen, b.length, "buffers should have same length");
  for (var i=0; i<bufLen; i++) {
    var c1 = a[i],
        c2 = b[i];
    if (Math.abs(c1 - c2) > precision) {
      assert.equal(c1, c2);
    }
  }
  return true;
}

describe("mapshaper-simplify.js", function() {
  describe("thinArcByInterval()", function() {
    var n5 = {
      xx: [0, 1, 8, 2, 0],
      yy: [2, 4, 3, 0, 1],
      uu: [Infinity, 23, 43, 14, Infinity]
    };

    it("removes interior vertices with threshold <= [u]", function() {
      assert.deepEqual(api.thinArcByInterval(n5.xx, n5.yy, n5.uu, 0),
        [[0, 1, 8, 2, 0], [2, 4, 3, 0, 1]]);
      assert.deepEqual(api.thinArcByInterval(n5.xx, n5.yy, n5.uu, 14),
        [[0, 1, 8, 0], [2, 4, 3, 1]]);
      assert.deepEqual(api.thinArcByInterval(n5.xx, n5.yy, n5.uu, 25),
        [[0, 8, 0], [2, 3, 1]]);
      assert.deepEqual(api.thinArcByInterval(n5.xx, n5.yy, n5.uu, 45),
        [[0, 0], [2, 1]]);
    })

    it("retains highest-value interior points when @retained is used", function() {
      assert.deepEqual(api.thinArcByInterval(n5.xx, n5.yy, n5.uu, 45, 1),
        [[0, 8, 0], [2, 3, 1]]);
      assert.deepEqual(api.thinArcByInterval(n5.xx, n5.yy, n5.uu, 25, 2),
        [[0, 1, 8, 0], [2, 4, 3, 1]]);
    })
  })

  describe("convLngLatToSph()", function() {
    var xbuf, ybuf, zbuf,
      R = 6378137;

    beforeEach(function() {
      xbuf = [];
      ybuf = [];
      zbuf = [];
    });

    it("correctly handles coordinates at the poles", function() {
      api.convLngLatToSph([0, 90, 180, -180], [90, 90, -90, -90], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [0, 0, 0, 0]);
      coordBuffersEqual(ybuf, [0, 0, 0, 0]);
      coordBuffersEqual(zbuf, [R, R, -R, -R]);
    })

    it("correctly handles coordinates at the equator", function() {
      api.convLngLatToSph([0, 90, 180, -90, -180], [0, 0, 0, 0], xbuf, ybuf, zbuf);
      coordBuffersEqual(xbuf, [R, 0, -R, 0, R]);
      coordBuffersEqual(ybuf, [0, R, 0, -R, 0]);
      coordBuffersEqual(zbuf, [0, 0, 0, 0, 0]);
    })
  })

  describe("stripArc()", function() {
    var n2 = {
      xx: [0, 1],
      yy: [2, 4],
      uu: [Infinity, Infinity]
    };

    var n3 = {
      xx: [0, 1, 8],
      yy: [2, 4, 3],
      uu: [Infinity, 23, Infinity]
    };

    var n5 = {
      xx: [0, 1, 8, 2, 0],
      yy: [2, 4, 3, 0, 1],
      uu: [Infinity, 23, 43, 14, Infinity]
    };

    it("should not modify an n2 arc", function() {
      assert.deepEqual(api.stripArc(n2.xx, n2.yy, n2.uu, 0),
        [[0, 1], [2, 4]]);
      assert.deepEqual(api.stripArc(n2.xx, n2.yy, n2.uu, 1),
        [[0, 1], [2, 4]]);
      assert.deepEqual(api.stripArc(n2.xx, n2.yy, n2.uu, 2),
        [[0, 1], [2, 4]]);
    })
   
    it("should remove all interior points from an arc with retained == 0", function() {
      assert.deepEqual(api.stripArc(n3.xx, n3.yy, n3.uu, 0),
        [[0, 8], [2, 3]]);
      assert.deepEqual(api.stripArc(n5.xx, n5.yy, n5.uu, 0),
        [[0, 0], [2, 1]]);
    })

    it("should retain the max point from an arc if retained == 1", function() {
      assert.deepEqual(api.stripArc(n5.xx, n5.yy, n5.uu, 1),
        [[0, 8, 0], [2, 3, 1]]);
    })
 
    it("should retain the max 2 points from an arc if retained == 2", function() {
      assert.deepEqual(api.stripArc(n5.xx, n5.yy, n5.uu, 2),
        [[0, 1, 8, 0], [2, 4, 3, 1]]);
    })
 
    it("should retain all points if retained >= [no. interior points]", function() {
      assert.deepEqual(api.stripArc(n5.xx, n5.yy, n5.uu, 10),
        [[0, 1, 8, 2, 0], [2, 4, 3, 0, 1]]);
      assert.deepEqual(api.stripArc(n5.xx, n5.yy, n5.uu, 3),
        [[0, 1, 8, 2, 0], [2, 4, 3, 0, 1]]);
    })
  })
})
