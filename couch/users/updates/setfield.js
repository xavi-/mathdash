function(doc, req) {
    var field = req.query.field, value = req.query.value;
    doc[field] = value;
    return [ doc, JSON.stringify({ "field": field, "value": value }) ];
}