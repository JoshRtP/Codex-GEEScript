/****
SOC DSM Starter Repo v3 - 01_build_feature_stack_v3.js

Extends the v2 stack with management-proxy features for:
- cover crop likelihood / frequency
- reduced-till / residue-retention likelihood
- bare-soil timing metrics that help separate intensive tillage from residue cover

IMPORTANT:
1) These layers are PROXIES, not audit-proof direct observation of management.
2) For MRV use, combine them with farmer-reported data, practice attestations, receipts,
   and any available implement / operations data.
3) Cover crop detection is region- and crop-system-specific. You must tune the windows.
4) Tillage detection from optical imagery alone is imperfect; best practice is a confidence score,
   not a hard binary label.
****/

var aoi = ee.FeatureCollection('projects/your-project/assets/project_boundary');

// ----------------------------
// User-tunable windows
// ----------------------------
var mainDateStart = '2019-01-01';
var mainDateEnd   = '2024-12-31';

// Typical U.S. corn/soy style windows; tune for your geography.
var fallWindowStart = '-09-01';
var fallWindowEnd   = '-12-15';
var springWindowStart = '-02-01';
var springWindowEnd   = '-05-15';

function maskS2Clouds(img) {
  var scl = img.select('SCL');
  var good = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));
  return img.updateMask(good).copyProperties(img, ['system:time_start']);
}

function addIndices(img) {
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('ndvi');
  var evi = img.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      NIR: img.select('B8'),
      RED: img.select('B4'),
      BLUE: img.select('B2')
    }).rename('evi');
  var ndti = img.normalizedDifference(['B11', 'B12']).rename('ndti');
  var ndmi = img.normalizedDifference(['B8', 'B11']).rename('ndmi');
  var nbr2 = img.normalizedDifference(['B11', 'B12']).rename('nbr2');
  var bsi = img.expression(
    '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))', {
      SWIR: img.select('B11'),
      RED: img.select('B4'),
      NIR: img.select('B8'),
      BLUE: img.select('B2')
    }).rename('bsi');
  var brightness = img.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .reduce(ee.Reducer.mean())
    .rename('brightness');
  return img.addBands([ndvi, evi, ndti, ndmi, nbr2, bsi, brightness]);
}

function addBareMask(img) {
  var ndvi = img.select('ndvi');
  var ndmi = img.select('ndmi');
  var bare = ndvi.lt(0.25).and(ndmi.lt(0.1));
  return img.addBands(bare.rename('bare_mask')).copyProperties(img, ['system:time_start']);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(mainDateStart, mainDateEnd)
  .map(maskS2Clouds)
  .map(addIndices)
  .map(addBareMask);

// ----------------------------
// Base remote-sensing stack
// ----------------------------
var rsMedian = s2.select([
    'B2','B3','B4','B8','B11','B12',
    'ndvi','evi','ndti','ndmi','nbr2','bsi','brightness'
  ]).median();

var rsP10 = s2.select(['ndvi','evi','brightness','bsi']).reduce(ee.Reducer.percentile([10]));
var rsP90 = s2.select(['ndvi','evi','brightness','bsi']).reduce(ee.Reducer.percentile([90]));
var ndviStd = s2.select('ndvi').reduce(ee.Reducer.stdDev()).rename('ndvi_std');
var bareFreq = s2.select('bare_mask').mean().rename('bare_freq');

var bareComp = s2
  .updateMask(s2.select('bare_mask'))
  .select(['B2','B3','B4','B8','B11','B12','brightness','bsi','ndti'])
  .median()
  .rename(['bare_B2','bare_B3','bare_B4','bare_B8','bare_B11','bare_B12','bare_brightness','bare_bsi','bare_ndti']);

// ----------------------------
// Terrain and climate
// ----------------------------
var dem = ee.Image('USGS/SRTMGL1_003').clip(aoi).rename('elev');
var terrain = ee.Algorithms.Terrain(dem);
var slope = terrain.select('slope');
var aspect = terrain.select('aspect');

var terraclimate = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('2014-01-01', '2023-12-31')
  .select(['pr', 'tmmn', 'tmmx', 'pet'])
  .mean()
  .rename(['clim_pr_mean', 'clim_tmmn_mean', 'clim_tmmx_mean', 'clim_pet_mean']);

// ----------------------------
// CDL crop history
// ----------------------------
function cropFrequency(years, classList, outName) {
  var yearlyMasks = ee.ImageCollection(years.map(function(y) {
    y = ee.Number(y);
    var cdl = ee.ImageCollection('USDA/NASS/CDL')
      .filter(ee.Filter.calendarRange(y, y, 'year'))
      .first()
      .select('cropland');
    var mask = cdl.remap(classList, ee.List.repeat(1, classList.length), 0)
      .rename(outName + '_' + y.format())
      .toFloat();
    return mask;
  }));
  return yearlyMasks.mean().rename(outName + '_freq');
}

var years = ee.List.sequence(2020, 2024);
var cornFreq = cropFrequency(years, [1], 'corn');
var soyFreq = cropFrequency(years, [5], 'soy');
var wheatFreq = cropFrequency(years, [22, 23, 24], 'wheat');
var alfalfaFreq = cropFrequency(years, [36], 'alfalfa');
var pastureFreq = cropFrequency(years, [176], 'pasture');
var winterWheatFreq = cropFrequency(years, [24], 'winter_wheat');
var doubleCropFreq = cropFrequency(years, [26, 225, 236], 'double_crop');

// ----------------------------
// Cover crop proxy features
// ----------------------------
// Idea: after harvest, fields with living cover tend to keep higher green signal in fall/winter/early spring
// than bare fields, especially relative to local crop-history context.

function seasonalComposite(year, mmddStart, mmddEnd, bands) {
  var start = ee.Date.parse('YYYY-MM-dd', ee.Number(year).format().cat(mmddStart));
  var end = ee.Date.parse('YYYY-MM-dd', ee.Number(year).format().cat(mmddEnd));
  return s2.filterDate(start, end).select(bands).median();
}

var annualMgmtImages = ee.ImageCollection(years.map(function(y) {
  y = ee.Number(y);

  var fallComp = seasonalComposite(y, fallWindowStart, fallWindowEnd, ['ndvi','evi','ndmi','bsi','bare_mask']);
  var springComp = seasonalComposite(y, springWindowStart, springWindowEnd, ['ndvi','evi','ndmi','bsi','bare_mask']);

  // Green cover retained or established outside peak main-season crop signal.
  var coverLikely = fallComp.select('ndvi').gt(0.30)
    .or(springComp.select('ndvi').gt(0.35))
    .rename('cover_crop_likely_' + y.format());

  // Continuous living cover signal proxy.
  var fallSpringGreenness = fallComp.select('ndvi')
    .add(springComp.select('ndvi'))
    .rename('fall_spring_ndvi_sum_' + y.format());

  var springResidueContrast = springComp.select('bsi')
    .subtract(springComp.select('ndvi'))
    .rename('spring_residue_contrast_' + y.format());

  return coverLikely
    .addBands(fallComp.select('ndvi').rename('fall_ndvi_' + y.format()))
    .addBands(springComp.select('ndvi').rename('spring_ndvi_' + y.format()))
    .addBands(fallSpringGreenness)
    .addBands(springResidueContrast)
    .toFloat();
}));

var coverCropFreq = annualMgmtImages.select('cover_crop_likely_.*').mean().rename('cover_crop_freq_proxy');
var fallNdviMean = annualMgmtImages.select('fall_ndvi_.*').mean().rename('fall_ndvi_mean');
var springNdviMean = annualMgmtImages.select('spring_ndvi_.*').mean().rename('spring_ndvi_mean');
var fallSpringNdviSumMean = annualMgmtImages.select('fall_spring_ndvi_sum_.*').mean().rename('fall_spring_ndvi_sum_mean');

// ----------------------------
// Tillage proxy features
// ----------------------------
// Idea: intensive tillage often increases bare-soil exposure and decreases retained residue.
// NDTI / residue-like behavior and timing of bare exposure are used here only as proxies.

var springOnly = s2.filter(ee.Filter.calendarRange(2, 5, 'month'));
var springBareFreq = springOnly.select('bare_mask').mean().rename('spring_bare_freq');
var springNdtiMed = springOnly.select('ndti').median().rename('spring_ndti_med');
var springBsiMed = springOnly.select('bsi').median().rename('spring_bsi_med');

// Higher residue retention + less spring bare exposure ~= reduced till proxy.
var reducedTillLikelihood = springNdtiMed.subtract(springBareFreq)
  .rename('reduced_till_likelihood_proxy');

var intensiveTillLikelihood = springBareFreq.add(springBsiMed)
  .subtract(springNdtiMed)
  .rename('intensive_till_likelihood_proxy');

// ----------------------------
// Optional soil hooks
// ----------------------------
// Replace placeholders with your own uploaded rasters if desired.
var soilgridsClay = ee.Image.constant(0).rename('sg_clay_placeholder').clip(aoi);
var soilgridsSand = ee.Image.constant(0).rename('sg_sand_placeholder').clip(aoi);
var ssurgoAwc = ee.Image.constant(0).rename('ssurgo_awc_placeholder').clip(aoi);

// ----------------------------
// Final stack
// ----------------------------
var featureImage = rsMedian
  .addBands(rsP10)
  .addBands(rsP90)
  .addBands(ndviStd)
  .addBands(bareFreq)
  .addBands(bareComp)
  .addBands(dem)
  .addBands(slope)
  .addBands(aspect)
  .addBands(terraclimate)
  .addBands(cornFreq)
  .addBands(soyFreq)
  .addBands(wheatFreq)
  .addBands(alfalfaFreq)
  .addBands(pastureFreq)
  .addBands(winterWheatFreq)
  .addBands(doubleCropFreq)
  .addBands(coverCropFreq)
  .addBands(fallNdviMean)
  .addBands(springNdviMean)
  .addBands(fallSpringNdviSumMean)
  .addBands(springBareFreq)
  .addBands(springNdtiMed)
  .addBands(springBsiMed)
  .addBands(reducedTillLikelihood)
  .addBands(intensiveTillLikelihood)
  .addBands(soilgridsClay)
  .addBands(soilgridsSand)
  .addBands(ssurgoAwc)
  .clip(aoi)
  .toFloat();

print('v3 feature bands', featureImage.bandNames());
Map.centerObject(aoi, 10);
Map.addLayer(featureImage.select('cover_crop_freq_proxy'), {min: 0, max: 1}, 'cover_crop_freq_proxy');
Map.addLayer(featureImage.select('reduced_till_likelihood_proxy'), {min: -1, max: 1}, 'reduced_till_proxy');
Map.addLayer(featureImage.select('intensive_till_likelihood_proxy'), {min: -1, max: 1}, 'intensive_till_proxy');

Export.image.toAsset({
  image: featureImage,
  description: 'export_soc_feature_stack_v3',
  assetId: 'projects/your-project/assets/soc_feature_stack_v3',
  region: aoi.geometry(),
  scale: 10,
  maxPixels: 1e13
});
