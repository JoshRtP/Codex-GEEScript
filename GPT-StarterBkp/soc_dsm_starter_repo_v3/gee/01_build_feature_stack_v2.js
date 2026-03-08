/****
SOC DSM Starter Repo v2 - 01_build_feature_stack_v2.js
Builds a richer predictor stack for SOC modeling, including:
- Sentinel-2 vegetation and bare-soil summaries
- 5-year CDL crop-history frequencies
- optional SoilGrids hooks
- optional local SSURGO raster hooks

Before running:
1) Replace all asset IDs.
2) Review CDL class IDs for your target geography and crop groups.
3) Upload any local soil rasters you want to include (for example, SSURGO clay or AWC rasters).
****/

var aoi = ee.FeatureCollection('projects/your-project/assets/project_boundary');

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
  var brightness = img.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .reduce(ee.Reducer.mean())
    .rename('brightness');
  return img.addBands([ndvi, evi, ndti, ndmi, brightness]);
}

function bareMask(img) {
  var ndvi = img.select('ndvi');
  var ndmi = img.select('ndmi');
  var bare = ndvi.lt(0.25).and(ndmi.lt(0.1));
  return img.addBands(bare.rename('bare_mask')).updateMask(bare);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate('2020-01-01', '2024-12-31')
  .map(maskS2Clouds)
  .map(addIndices);

var rsMedian = s2.select(['B2','B3','B4','B8','B11','B12','ndvi','evi','ndti','ndmi','brightness']).median();
var rsP10 = s2.select(['ndvi','evi','brightness']).reduce(ee.Reducer.percentile([10]));
var rsP90 = s2.select(['ndvi','evi','brightness']).reduce(ee.Reducer.percentile([90]));
var ndviStd = s2.select('ndvi').reduce(ee.Reducer.stdDev()).rename('ndvi_std');

var bareCollection = s2.map(bareMask);
var bareComp = bareCollection
  .select(['B2','B3','B4','B8','B11','B12','brightness'])
  .median()
  .rename(['bare_B2','bare_B3','bare_B4','bare_B8','bare_B11','bare_B12','bare_brightness']);
var bareFreq = bareCollection.select('bare_mask').mean().rename('bare_freq');

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
// CDL crop-history frequencies
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

// ----------------------------
// SoilGrids hooks (placeholders)
// ----------------------------
// Replace these with your own imported or uploaded rasters.
// Example expected layers: sg_clay_0_30, sg_sand_0_30, sg_phh2o_0_30, sg_bdod_0_30
var sgClay = ee.Image('projects/your-project/assets/soilgrids/sg_clay_0_30').rename('sg_clay_0_30');
var sgSand = ee.Image('projects/your-project/assets/soilgrids/sg_sand_0_30').rename('sg_sand_0_30');
var sgPh = ee.Image('projects/your-project/assets/soilgrids/sg_phh2o_0_30').rename('sg_phh2o_0_30');
var sgBd = ee.Image('projects/your-project/assets/soilgrids/sg_bdod_0_30').rename('sg_bdod_0_30');

// ----------------------------
// Local SSURGO hooks (placeholders)
// ----------------------------
// Upload project-specific rasters if you want to use SSURGO-based predictors.
var ssClay = ee.Image('projects/your-project/assets/ssurgo/ssurgo_clay_0_30').rename('ssurgo_clay_0_30');
var ssAwc = ee.Image('projects/your-project/assets/ssurgo/ssurgo_awc_0_30').rename('ssurgo_awc_0_30');
var ssDrain = ee.Image('projects/your-project/assets/ssurgo/ssurgo_drainage').rename('ssurgo_drainage');

var featureStack = rsMedian
  .addBands(rsP10)
  .addBands(rsP90)
  .addBands(ndviStd)
  .addBands(bareComp)
  .addBands(bareFreq)
  .addBands(dem)
  .addBands(slope)
  .addBands(aspect)
  .addBands(terraclimate)
  .addBands(cornFreq)
  .addBands(soyFreq)
  .addBands(wheatFreq)
  .addBands(alfalfaFreq)
  .addBands(pastureFreq)
  .addBands(sgClay)
  .addBands(sgSand)
  .addBands(sgPh)
  .addBands(sgBd)
  .addBands(ssClay)
  .addBands(ssAwc)
  .addBands(ssDrain)
  .clip(aoi)
  .float();

print('Feature stack bands', featureStack.bandNames());
Map.centerObject(aoi, 10);
Map.addLayer(featureStack.select('ndvi'), {min: 0, max: 0.8}, 'NDVI median');
Map.addLayer(featureStack.select('corn_freq'), {min: 0, max: 1}, 'Corn frequency');
Map.addLayer(featureStack.select('bare_freq'), {min: 0, max: 1}, 'Bare soil frequency');

Export.image.toAsset({
  image: featureStack,
  description: 'soc_feature_stack_v2_asset',
  assetId: 'projects/your-project/assets/soc_feature_stack_v2',
  region: aoi.geometry(),
  scale: 10,
  maxPixels: 1e13
});
