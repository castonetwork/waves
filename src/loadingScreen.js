let isPlay = false;

const initLoadingScreen = ()=> {
  isPlay = true;
  var svgEl = document.querySelector('.animated-lines');

  var randomRange = function(min, max) {
    return ~~(Math.random() * (max - min + 1)) + min
  };

  var numberOfLines = 20,
    lineDataArr = [];

  var createPathString = function() {

    var completedPath = '',
      comma = ',',
      ampl = 50; // pixel range from 0, aka how deeply they bend

    for (var i = 0; i < numberOfLines; i++) {

      var path = lineDataArr[i];

      var current = {
        x: ampl * Math.sin(path.counter / path.sin),
        y: ampl * Math.cos(path.counter / path.cos)
      };

      var newPathSection = `M${path.startX}${comma}${path.startY} 
        Q${path.pointX}${comma}${(current.y * 1.5).toFixed(3)}
        ${((current.x) / 10 + path.centerX).toFixed(3)}${comma}${((current.y) / 5 + path.centerY).toFixed(3)}
        T${path.endX}${comma}${path.endY}`;
      path.counter++;

      completedPath += newPathSection;

    };

    return completedPath;

  };

  var createLines = function() {

    var newPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path'),
      // higher is slower
      minSpeed = 85,
      maxSpeed = 150;

    // create an arr which contains objects for all lines
    // createPathString() will use this array
    for (var i = 0; i < numberOfLines; i++) {

      var lineDataObj = {
        counter: randomRange(1, 500), // a broad counter range ensures lines start at different cycles (will look more random)
        startX: randomRange(-5, -40),
        startY: randomRange(-5, -30),
        endX: randomRange(200, 220), // viewbox = 200
        endY: randomRange(120, 140), // viewbox = 120
        sin: randomRange(minSpeed, maxSpeed),
        cos: randomRange(minSpeed, maxSpeed),
        pointX: randomRange(30, 55),
        centerX: randomRange(90, 120),
        centerY: randomRange(60, 70)
      }

      lineDataArr.push(lineDataObj)

    }

    var animLoop = function() {
      isPlay && newPathEl.setAttribute('d', createPathString());
      requestAnimationFrame(animLoop);
    }

    // once the path elements are created, start the animation loop
    svgEl.appendChild(newPathEl);
    svgEl.viewBox.baseVal.width = 200;
    svgEl.viewBox.baseVal.height = 120;
    animLoop();

  };

  createLines();
};

const pauseAnimation = ()=> isPlay = false;
const resumeAnimation = ()=> isPlay = true;

module.exports = {
  initLoadingScreen,
  pauseAnimation,
  resumeAnimation,
};
