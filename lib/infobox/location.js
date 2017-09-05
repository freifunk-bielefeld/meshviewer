define(['helper'], function (helper) {
  'use strict';

  return function (config, el, router, d) {
    var sidebarTitle = document.createElement('h2');
    sidebarTitle.textContent = _.t('location.location');
    el.appendChild(sidebarTitle);

    helper.getJSON(config.reverseGeocodingApi + '?format=json&lat=' + d.lat + '&lon=' + d.lng + '&zoom=18&addressdetails=0&accept-language=' + _.locale())
      .then(function (result) {
        if (result.display_name) {
          sidebarTitle.outerHTML += '<p>' + result.display_name + '</p>';
        }
      });

    var editLat = document.createElement('input');
    editLat.type = 'text';
    editLat.value = d.lat.toFixed(9);
    el.appendChild(createBox('lat', _.t('location.latitude'), editLat));

    var editLng = document.createElement('input');
    editLng.type = 'text';
    editLng.value = d.lng.toFixed(9);
    el.appendChild(createBox('lng', _.t('location.longitude'), editLng));

    function createBox(name, title, inputElem) {
      var box = document.createElement('div');
      var heading = document.createElement('h3');
      heading.textContent = title;
      box.appendChild(heading);
      var btn = document.createElement('button');
      btn.classList.add('ion-clipboard');
      btn.title = _.t('location.copy');
      btn.onclick = function onclick() {
        copy2clip(inputElem.id);
      };
      inputElem.id = 'location-' + name;
      inputElem.readOnly = true;
      var line = document.createElement('p');
      line.appendChild(inputElem);
      line.appendChild(btn);
      box.appendChild(line);
      box.id = 'box-' + name;
      return box;
    }

    function copy2clip(id) {
      var copyField = document.querySelector('#' + id);
      copyField.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.warn(err);
      }
    }
  };
});
