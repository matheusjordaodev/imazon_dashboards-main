window.dashExtensions = Object.assign({}, window.dashExtensions, {
    default: {
        function0: function(feature) {
                return {
                    color: "black",
                    weight: 1,
                    opacity: 0.7,
                    fillOpacity: 0.4,
                    fillColor: "#" + Math.floor(Math.random() * 16777215).toString(16)
                }
            }

            ,
        function1: function(feature, layer) {
            var props = feature.properties || {};
            var rows = Object.keys(props)
                .map(k => "<tr><th>" + k + "</th><td>" + props[k] + "</td></tr>")
                .join("");
            var table = "<table style='border-spacing:4px;font-size:0.8em'>" +
                rows + "</table>";
            layer.bindPopup(table);
        }

    }
});