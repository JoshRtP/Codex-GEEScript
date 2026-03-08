/**
 * diag_ndti_field68250.js
 *
 * Diagnostic script: prints raw NDTI (and supporting bands) for field 68250
 * across every fall and spring window from 2020-2024 so you can verify the
 * classification numbers match what field_analytics_v2.js computes.
 *
 * Paste into GEE Code Editor and click Run.  Results appear in the Console.
 * No UI / no panels – pure inspection.
 *
 * NDTI = (B11 - B8) / (B11 + B8)
 *   > 0.20      residue present  → expect reduced / no-till
 *     0.00–0.20  some residue
 *   < 0.00      bare / tilled   → expect intensive till
 */

// ── Config ────────────────────────────────────────────────────────────────────
var FIELD_ASSET = 'projects/gen-lang-client-0499108456/assets/FieldMask_5070';
var TARGET_PID  = 68250;
var PROXY_YEARS = [2020, 2021, 2022, 2023, 2024];

var FALL_START   = '09-01';
var FALL_END     = '11-30';
var SPRING_START = '02-01';
var SPRING_END   = '05-15';

// Sentinel-2 cloud filter – same default as v2 (30 %)
var MAX_CLOUD_PCT = 30;

// ── Load the single field ────────────────────────────────────────────────────
var fields = ee.FeatureCollection(FIELD_ASSET).map(function(f){
  var pid = f.get('poly_id');
  // fall back to 'fid' or 'id' if poly_id is absent in your schema
  return f.set('poly_id', ee.Algorithms.If(pid, pid, f.get('fid')));
});

var targetField = fields.filter(ee.Filter.eq('poly_id', TARGET_PID)).first();
var geom = ee.Feature(targetField).geometry();

// Centre the map on the field
Map.centerObject(geom, 15);
Map.addLayer(geom, {color: 'cyan'}, 'Field ' + TARGET_PID);

// ── Index helpers ────────────────────────────────────────────────────────────
function maskS2(img){
  var scl = img.select('SCL');
  var bad = scl.eq(0).or(scl.eq(1)).or(scl.eq(2)).or(scl.eq(3))
              .or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10));
  return img.updateMask(bad.not());
}

function addIndices(img){
  var nir  = img.select('B8');
  var red  = img.select('B4');
  var blue = img.select('B2');
  var sw1  = img.select('B11');
  var sw2  = img.select('B12');
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  var ndti = sw1.subtract(nir).divide(sw1.add(nir)).rename('NDTI');   // (B11-B8)/(B11+B8)
  var bsi  = sw1.add(red).subtract(nir.add(blue))
               .divide(sw1.add(red).add(nir.add(blue))).rename('BSI');
  var ndmi = nir.subtract(sw1).divide(nir.add(sw1)).rename('NDMI');
  var bare = ndvi.lt(0.25).and(ndmi.lt(0.10)).rename('bare_frac');
  return img.addBands([ndvi, ndti, bsi, ndmi, bare]);
}

/**
 * Returns a median composite clipped to geom for a given year + MM-DD window.
 * Prints the image count used so you can judge data availability.
 */
function seasonalStats(year, mmddStart, mmddEnd, label){
  var yearStr = ee.Number(year).int().format();
  var start = ee.Date.parse('YYYY-MM-dd', yearStr.cat('-').cat(mmddStart));
  var end   = ee.Date.parse('YYYY-MM-dd', yearStr.cat('-').cat(mmddEnd)).advance(1, 'day');

  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', MAX_CLOUD_PCT))
    .map(maskS2)
    .map(addIndices);

  var n    = col.size();
  var med  = ee.Image(ee.Algorithms.If(
    n.gt(0),
    col.median().clip(geom),
    ee.Image.constant([0,0,0,0,0])
      .rename(['NDVI','NDTI','BSI','NDMI','bare_frac'])
      .clip(geom)
  ));

  var stats = med.select(['NDVI','NDTI','BSI','NDMI','bare_frac'])
    .reduceRegion({
      reducer: ee.Reducer.mean()
        .combine(ee.Reducer.stdDev(), '', true)
        .combine(ee.Reducer.min(),    '', true)
        .combine(ee.Reducer.max(),    '', true),
      geometry: geom,
      scale: 10,
      maxPixels: 1e8
    });

  // Bundle for printing
  var out = ee.Dictionary({
    label      : label,
    year       : year,
    imageCount : n,
    NDVI_mean  : stats.get('NDVI_mean'),
    NDTI_mean  : stats.get('NDTI_mean'),
    NDTI_min   : stats.get('NDTI_min'),
    NDTI_max   : stats.get('NDTI_max'),
    NDTI_stdDev: stats.get('NDTI_stdDev'),
    BSI_mean   : stats.get('BSI_mean'),
    NDMI_mean  : stats.get('NDMI_mean'),
    bare_frac  : stats.get('bare_frac_mean')
  });

  return {stats: out, med: med, n: n};
}

// ── Run over all years ────────────────────────────────────────────────────────
print('=== NDTI Diagnostic — Field', TARGET_PID, '===');
print('NDTI = (B11 - B8) / (B11 + B8)');
print('Expected for NO tillage event (2024): NDTI_mean > 0.10 (residue present)');
print('Expected for tilled field: NDTI_mean < 0.00');
print('──────────────────────────────────────────');

PROXY_YEARS.forEach(function(yr){
  var fall   = seasonalStats(yr,   FALL_START,   FALL_END,   'FALL');
  var spring = seasonalStats(yr+1, SPRING_START, SPRING_END, 'SPRING');

  // Print fall result
  fall.stats.evaluate(function(d){
    print('▶ ' + yr + ' FALL  (' + FALL_START + '→' + FALL_END + ')  images=' + d.imageCount,
          '  NDVI=' + num(d.NDVI_mean) +
          '  NDTI=' + num(d.NDTI_mean) + ' [' + num(d.NDTI_min) + ',' + num(d.NDTI_max) + ']' +
          '  BSI=' + num(d.BSI_mean) +
          '  bare_frac=' + num(d.bare_frac));
  });

  // Print spring result
  spring.stats.evaluate(function(d){
    print('▶ ' + yr + ' SPRING(' + SPRING_START + '→' + SPRING_END + ')  images=' + d.imageCount,
          '  NDVI=' + num(d.NDVI_mean) +
          '  NDTI=' + num(d.NDTI_mean) + ' [' + num(d.NDTI_min) + ',' + num(d.NDTI_max) + ']' +
          '  BSI=' + num(d.BSI_mean) +
          '  bare_frac=' + num(d.bare_frac));

    // 2024 spring: compute proxy scores the same way v2 does
    if (yr === 2024){
      var reduced   = d.NDTI_mean - d.bare_frac;
      var intensive = d.bare_frac + d.BSI_mean - d.NDTI_mean;
      var margin    = reduced - intensive;

      print('  ── 2024 Proxy Scores ──');
      print('  reduced_till_proxy  = NDTI_mean - bare_frac  = ' + num(reduced));
      print('  intensive_till_proxy= bare_frac + BSI - NDTI  = ' + num(intensive));
      print('  margin (reduced-intensive)                    = ' + num(margin));
      if      (margin >  0.15) { print('  → Classification: LIKELY REDUCED TILL'); }
      else if (margin < -0.15) { print('  → Classification: LIKELY INTENSIVE TILL  ← if wrong, adjust thresholds or window'); }
      else                     { print('  → Classification: UNCERTAIN'); }

      print('  ── Cover Crop Check (spring NDVI) ──');
      print('  spring NDVI_mean = ' + num(d.NDVI_mean) + '  threshold = 0.35');
      if (d.NDVI_mean >= 0.35) { print('  → Cover crop LIKELY (spring NDVI above threshold)'); }
      else                     { print('  → Cover crop UNLIKELY on spring NDVI alone (check fall)'); }
    }
  });

  // Add spring composite to map for 2024 so you can visually inspect
  if (yr === 2024){
    Map.addLayer(spring.med.select('NDTI'),
      {min:-0.2, max:0.4, palette:['#d73027','#fee090','#e0f3f8','#74add1','#313695']},
      '2024 Spring NDTI (red=tilled, blue=residue)', true);
    Map.addLayer(fall.med.select('NDVI'),
      {min:0.1, max:0.7, palette:['#ffffcc','#78c679','#005a32']},
      '2024 Fall NDVI', false);
  }
});

// ── Helper: format to 4 dp ────────────────────────────────────────────────────
function num(v){ return v === null || v === undefined ? 'null' : (+v).toFixed(4); }
