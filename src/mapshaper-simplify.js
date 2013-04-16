/* @requires mapshaper-common, mapshaper-geom, median */

// TODO; calculate pct based on distinct points in the dataset
// TODO: pass number of points as a parameter instead of calculating it
MapShaper.getThresholdByPct = function(arr, retainPct) {
  if (retainPct <= 0 || retainPct >= 1) error("Invalid simplification pct:", retainPct);
  var n = arr.length;
  var count = 0,
      nth=2;
  for (var i=0; i<n; i++) {
    count += Math.ceil((arr[i].length - 2) / nth);
  }
  var tmp = new Float64Array(count),
      idx = 0;
  for (i=0; i<n; i++) {
    var thresholds = arr[i];
    for (var j=1, lim=thresholds.length - 1; j < lim; j+= nth) {
      tmp[idx++] = thresholds[j];
    }
  }
  if (idx != count) error("Counting error");
  var k = Math.floor((1 - retainPct) * count);
  return Utils.findValueByRank(tmp, k + 1); // rank start at 1
};


MapShaper.thinArcsByPct = function(arcs, thresholds, retainedPct, opts) {
  if (!Utils.isArray(arcs) || !Utils.isArray(thresholds) ||
      arcs.length != thresholds.length  || !Utils.isNumber(retainedPct))
    error("Invalid arguments; expected [Array], [Array], [Number]");
  T.start();
  var thresh = MapShaper.getThresholdByPct(thresholds, retainedPct);
  T.stop("Find simplification interval");

  T.start();
  var thinned = MapShaper.thinArcsByInterval(arcs, thresholds, thresh, opts);
  T.stop("Remove vertices");
  return thinned;
};


// Strip interior points from an arc.
// @retained gives the number of interior points to leave in (retains those
//    with the highest thresholds)
//
MapShaper.stripArc = function(xx, yy, uu, retained) {
  var data = [],
      len = xx.length,
      min, u, xx2, yy2;
  if (len < 2) error("Invalid arc");

  if (retained > 0) {
    for (var i=1, lim=len-1; i<lim; i++) {
      u = uu[i];
      if (data.length < retained) {
        data.push({i:i, u:u});
      } else if ((min=data[0]).u < u) {
        min.u = u;
        min.i = i;
      }
      if (retained > 1) Utils.sortOn(data, 'u', true);
    }
    Utils.sortOn(data, 'i', true);
  }
  xx2 = [xx[0]];
  yy2 = [yy[0]];
  Utils.forEach(data, function(obj) {
    xx2.push(xx[obj.i]);
    yy2.push(yy[obj.i]);
  })
  xx2.push(xx[len-1]);
  yy2.push(yy[len-1]);
  return [xx2, yy2];
};


MapShaper.thinArcByInterval = function(xsrc, ysrc, uu, interval, retainedPoints) {
  var xdest = [],
      ydest = [],
      srcLen = xsrc.length,
      destLen;

  if (ysrc.length != srcLen || uu.length != srcLen || srcLen < 2)
    error("[thinArcByThreshold()] Invalid arc data");

  for (var i=0; i<srcLen; i++) {
    if (uu[i] > interval) {
      xdest.push(xsrc[i]);
      ydest.push(ysrc[i]);
    }
  }

  if (xdest.length < retainedPoints + 2) { // minInteriorPoints doesn't include endpoints
    var stripped = MapShaper.stripArc(xsrc, ysrc, uu, retainedPoints);
    xdest = stripped[0];
    ydest = stripped[1];
  }

  // remove island rings that have collapsed (i.e. fewer than 4 points)
  // TODO: make sure that other kinds of collapsed rings are handled
  //    (maybe during topology phase, via minPoints array)
  //
  destLen = xdest.length;
  if (destLen < 4 && xdest[0] == xdest[destLen-1] && ydest[0] == ydest[destLen-1]) {
    xdest = [];
    ydest = [];
  }

  return [xdest, ydest];
};


MapShaper.thinArcsByInterval = function(srcArcs, thresholds, interval, opts) {
  if (!Utils.isArray(srcArcs) || srcArcs.length != thresholds.length)
    error("[thinArcsByInterval()] requires matching arrays of arcs and thresholds");
  if (!Utils.isNumber(interval))
    error("[thinArcsByInterval()] requires an interval");

  var retainPoints = !!opts.minPoints;
  if (retainPoints && opts.minPoints.length != srcArcs.length)
    error("[thinArcsByInterval()] Retained point array doesn't match arc length");

  var arcs = [],
      fullCount = 0,
      thinnedCount = 0;
  for (var i=0, l=srcArcs.length; i<l; i++) {
    var srcArc = srcArcs[i];
    var arc = MapShaper.thinArcByInterval(srcArc[0], srcArc[1], thresholds[i], interval, retainPoints ? opts.minPoints[i] : 0);
    fullCount += srcArc[0].length;
    thinnedCount += arc[0].length;
    arcs.push(arc);
  }
  return {
    arcs: arcs,
    info: {
      original_arc_points: fullCount,
      thinned_arc_points: thinnedCount
    }
  };
};


// Convert arrays of lng and lat coords (xsrc, ysrc) into 
// x, y, z coords on the surface of a sphere with radius 6378137
// (the radius of spherical Earth datum in meters)
//
MapShaper.convLngLatToSph = function(xsrc, ysrc, xbuf, ybuf, zbuf) {
  var deg2rad = Math.PI / 180,
      r = 6378137;
  for (var i=0, len=xsrc.length; i<len; i++) {
    var lng = xsrc[i] * deg2rad,
        lat = ysrc[i] * deg2rad,
        cosLat = Math.cos(lat);
    xbuf[i] = Math.cos(lng) * cosLat * r;
    ybuf[i] = Math.sin(lng) * cosLat * r;
    zbuf[i] = Math.sin(lat) * r;
  }
}

// Apply a simplification function to each arc in an array, return simplified arcs.
// 
// @simplify: function(xx:array, yy:array, [zz:array], [length:integer]):array
//
MapShaper.simplifyArcs = function(arcs, simplify, opts) {
  T.start();
  var arcs;
  if (opts && opts.spherical) {
    arcs = MapShaper.simplifyArcsSph(arcs, simplify);
  } else {
    arcs = Utils.map(arcs, function(arc) {
      return simplify(arc[0], arc[1]);
    });
  }
  T.stop("Calculate simplification data");
  return arcs
};


MapShaper.simplifyArcsSph = function(arcs, simplify) {
  var bufSize = 0,
      xbuf, ybuf, zbuf;

  var data = Utils.map(arcs, function(arc) {
    var arcLen = arc[0].length;
    if (bufSize < arcLen) {
      bufSize = Math.round(arcLen * 1.2);
      xbuf = new Float64Array(bufSize);
      ybuf = new Float64Array(bufSize);
      zbuf = new Float64Array(bufSize);
    }

    MapShaper.convLngLatToSph(arc[0], arc[1], xbuf, ybuf, zbuf);
    return simplify(xbuf, ybuf, zbuf, arcLen);
  });
  return data;
};