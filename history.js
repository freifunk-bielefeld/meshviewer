L.AwesomeMarkers.Icon.prototype.options.prefix = 'ion'

document.addEventListener('DOMContentLoaded', main)

function get(url) {
  return new Promise(function(resolve, reject) {
    var req = new XMLHttpRequest();
    req.open('GET', url);

    req.onload = function() {
      if (req.status == 200) {
        resolve(req.response);
      }
      else {
        reject(Error(req.statusText));
      }
    };

    req.onerror = function() {
      reject(Error("Network Error"));
    };

    req.send();
  });
}

function getJSON(url) {
  return get(url).then(JSON.parse)
}

function main() {
  getJSON("config.json").then( function (config) {
    var options = { worldCopyJump: true,
                    zoomControl: false
                  }

    var map = L.map(document.getElementById("map"), options)

    var sh = document.getElementById("sidebarhandle")
    sh.onclick = function () {
      var sb = document.getElementById("sidebar")

      if (sb.classList.contains("hidden"))
        sb.classList.remove("hidden")
      else
        sb.classList.add("hidden")

      map.invalidateSize()
    }


    var urls = [ config.dataPath + 'nodes.json',
                 config.dataPath + 'graph.json'
               ]

    var p = Promise.all(urls.map(getJSON))
    p.then(handle_data(config, map))
  })
}

function sort(key, d) {
  return d.slice().sort( function (a, b) {
    return a[key] - b[key]
  }).reverse()
}

function limit(key, m, d) {
  return d.filter( function (d) {
    return d[key].isAfter(m)
  })
}

function offline(d) {
  return !d.flags.online
}

function online(d) {
  return d.flags.online
}

function has_location(d) {
  return "location" in d.nodeinfo
}

function subtract(a, b) {
  var ids = {}

  b.forEach( function (d) {
    ids[d.nodeinfo.node_id] = true
  })

  return a.filter( function (d) {
    return !(d.nodeinfo.node_id in ids)
  })
}

function handle_data(config, map) {
  return function (data) {
    var nodedict = data[0]
    var nodes = Object.keys(nodedict.nodes).map(function (key) { return nodedict.nodes[key] })

    nodes = nodes.filter( function (d) {
      return "firstseen" in d && "lastseen" in d
    })

    nodes.forEach( function(node) {
      node.firstseen = moment(node.firstseen)
      node.lastseen = moment(node.lastseen)
    })

    var age = moment().subtract(14, 'days')

    var newnodes = limit("firstseen", age, sort("firstseen", nodes).filter(online))
    var lostnodes = limit("lastseen", age, sort("lastseen", nodes).filter(offline))

    var onlinenodes = subtract(nodes.filter(online).filter(has_location), newnodes)

    var graph = data[1].batadv
    var graphnodes = data[0].nodes

    graph.nodes.forEach( function (d) {
      if (d.node_id in graphnodes && "location" in graphnodes[d.node_id].nodeinfo)
        d.node = graphnodes[d.node_id]
    })

    graph.links.forEach( function (d) {
      if (graph.nodes[d.source].node)
        d.source = graph.nodes[d.source]
      else
        d.source = undefined

      if (graph.nodes[d.target].node)
        d.target = graph.nodes[d.target]
      else
        d.target = undefined
    })

    graph = graph.links.filter( function (d) {
      var ok = d.source !== undefined && d.target !== undefined
      return ok
    })

    graph.forEach( function (d) {
      d.latlngs = []
      d.latlngs.push(L.latLng(d.source.node.nodeinfo.location.latitude, d.source.node.nodeinfo.location.longitude))
      d.latlngs.push(L.latLng(d.target.node.nodeinfo.location.latitude, d.target.node.nodeinfo.location.longitude))

      d.distance = d.latlngs[0].distanceTo(d.latlngs[1])
    })

    longlinks = graph.slice().sort( function (a, b) {
      return a.distance - b.distance
    }).reverse().slice(0, Math.ceil(config.longLinkPercentile * graph.length))


    var markers = mkmap(map, newnodes, lostnodes, onlinenodes, graph, showNodeinfo, showLinkinfo)

    var gotoAnything = gotoBuilder(markers, showNodeinfo, showLinkinfo)

    addToList(document.getElementById("newnodes"), config.showContact, "firstseen", gotoAnything.node, newnodes)
    addToList(document.getElementById("lostnodes"), config.showContact, "lastseen", gotoAnything.node, lostnodes)
    addToLongLinksList(document.getElementById("longlinks"), gotoAnything.link, longlinks)

    showMeshstats(document.getElementById("meshstats"), nodes)
  }
}

function showDistance(d) {
  return (new Intl.NumberFormat("de-DE", {maximumFractionDigits: 0}).format(d.distance)) + " m"
}

function showTq(d) {
  var opts = { maximumFractionDigits: 2,
               minimumFractionDigits: 2
             }

  return (new Intl.NumberFormat("de-DE", opts).format(d.tq)) + " TQ"
}

function linkId(d) {
  return d.source.node.nodeinfo.node_id + "-" + d.target.node.nodeinfo.node_id
}

function mkmap(map, newnodes, lostnodes, onlinenodes, graph, showNodeinfo, showLinkinfo) {
  L.control.zoom({ position: "topright" }).addTo(map)

  L.tileLayer("http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.jpg", {
    subdomains: "1234",
    type: "osm",
    attribution: "Map data Tiles &copy; <a href=\"http://www.mapquest.com/\" target=\"_blank\">MapQuest</a> <img src=\"http://developer.mapquest.com/content/osm/mq_logo.png\" />, Map data © OpenStreetMap contributors, CC-BY-SA",
    maxZoom: 19,
    maxNativeZoom: 18
  }).addTo(map)

  var markersDict = addLinksToMap(map, graph, showLinkinfo)

  var nodes = newnodes.concat(lostnodes).filter( function (d) {
    return "location" in d.nodeinfo
  })

  var markers = nodes.map( function (d) {
    var icon = L.AwesomeMarkers.icon({ markerColor: d.flags.online ? "green" : "red",
                                       icon: d.flags.online ? "lightbulb" : "bug" })

    var opt = { icon: icon,
                title: d.nodeinfo.hostname
              }

    var m = L.marker([d.nodeinfo.location.latitude, d.nodeinfo.location.longitude], opt)

    m.on('click', function () { return showNodeinfo(d) })
    m.bindPopup(d.nodeinfo.hostname)

    markersDict[d.nodeinfo.node_id] = m

    return m
  })

  var onlinemarkers = onlinenodes.map( function (d) {
    var opt = { color: "#76B22D",
                fillColor: "#76B22D",
                radius: 5,
                opacity: 0.7,
                fillOpacity: 0.5
              }

    var m = L.circleMarker([d.nodeinfo.location.latitude, d.nodeinfo.location.longitude], opt)

    m.on('click', function () { return showNodeinfo(d) })
    m.bindPopup(d.nodeinfo.hostname)

    markersDict[d.nodeinfo.node_id] = m

    return m
  })

  var group = L.featureGroup(markers).addTo(map)
  var group_online = L.featureGroup(onlinemarkers).addTo(map)

  map.fitBounds(group.getBounds())

  var funcDict = {}

  Object.keys(markersDict).map( function(k) {
       funcDict[k] = function (d) {
         var m = markersDict[k]
         if ("getBounds" in m) {
           var bounds = m.getBounds()
           map.fitBounds(bounds)
           m.openPopup(bounds.getCenter())
         } else {
           map.setView(m.getLatLng(), map.getMaxZoom())
           m.openPopup()
         }

         return false
       }
  });

  return funcDict
}

function addLinksToMap(map, graph, showLinkinfo) {
  var markersDict = {}

  var scale = chroma.scale(['green', 'orange', 'red']).domain([1, 10])

  var lines = graph.map( function (d) {
    var opts = { color: scale(d.tq).hex(),
                 weight: 4
               }

    var line = L.polyline(d.latlngs, opts)

    line.bindPopup(d.source.node.nodeinfo.hostname + " – " + d.target.node.nodeinfo.hostname + "<br><strong>" + showDistance(d) + " / " + showTq(d) + "</strong>")
    line.on('click', function () { return showLinkinfo(d) })

    markersDict[linkId(d)] = line

    return line
  })

  var group = L.featureGroup(lines).addTo(map)

  return markersDict
}

function addToLongLinksList(el, gotoProxy, links) {
  links.forEach( function (d) {
    var row = document.createElement("tr")
    var td1 = document.createElement("td")
    var a = document.createElement("a")
    a.textContent = d.source.node.nodeinfo.hostname + " – " + d.target.node.nodeinfo.hostname
    a.href = "#"
    a.onclick = gotoProxy(d)
    td1.appendChild(a)
    row.appendChild(td1)

    var td2 = document.createElement("td")
    td2.textContent = showDistance(d)
    row.appendChild(td2)

    var td3 = document.createElement("td")
    td3.textContent = showTq(d)
    row.appendChild(td3)

    el.appendChild(row)
  })
}

function addToList(el, showContact, tf, gotoProxy, list) {
  list.forEach( function (d) {
    var time = moment(d[tf]).fromNow()

    var row = document.createElement("tr")
    var td1 = document.createElement("td")
    var a = document.createElement("a")
    a.classList.add("hostname")
    a.classList.add(d.flags.online ? "online" : "offline")
    a.textContent = d.nodeinfo.hostname
    a.href = "#"
    a.onclick = gotoProxy(d)
    td1.appendChild(a)

    if ("location" in d.nodeinfo) {
      var span = document.createElement("span")
      span.classList.add("icon")
      span.classList.add("ion-location")
      td1.appendChild(span)
    }

    if ("owner" in d.nodeinfo && showContact) {
      var contact = d.nodeinfo.owner.contact
      td1.appendChild(document.createTextNode(" – " + contact + ""))
    }

    var td2 = document.createElement("td")
    td2.textContent = time

    row.appendChild(td1)
    row.appendChild(td2)
    el.appendChild(row)
  })
}

function sum(a) {
  return a.reduce( function (a, b) {
    return a + b
  }, 0)
}

function one() {
  return 1
}

function showMeshstats(el, nodes) {
  var totalNodes = sum(nodes.filter(online).map(one))

  var totalClients = sum(nodes.filter(online).map( function (d) {
    return d.statistics.clients
  }))

  var totalGateways = sum(nodes.filter(online).filter( function (d) {
    return d.flags.gateway
  }).map(one))

  el.textContent = totalNodes + " Knoten (online), " +
                   totalClients + " Clients, " +
                   totalGateways + " Gateways"
}

function showNodeinfo(d) {
  var el = document.getElementById("nodeinfo")

  destroy()
  el.classList.remove("hidden")
  el.scrollIntoView(false)

  var closeButton = document.createElement("button")
  closeButton.classList.add("close")
  closeButton.onclick = destroy
  el.appendChild(closeButton)

  var h2 = document.createElement("h2")
  h2.textContent = d.nodeinfo.hostname
  el.appendChild(h2)

  var pre = document.createElement("pre")
  pre.textContent = JSON.stringify(d, null, ' ')
  el.appendChild(pre)

  function destroy() {
    el.classList.add("hidden")
    while (el.hasChildNodes())
      el.removeChild(el.childNodes[0])
  }
}

function showLinkinfo(d) {
}

function gotoBuilder(markers, nodes, links) {
  function gotoNode(d) {
    if (d.nodeinfo.node_id in markers)
      markers[d.nodeinfo.node_id]()

    nodes(d)

    return false
  }

  function gotoLink(d) {
    if (linkId(d) in markers)
      markers[linkId(d)]()

    links(d)

    return false
  }

  return { node: function (d) { return function () { return gotoNode(d) }},
           link: function (d) { return function () { return gotoLink(d) }}
         }
}