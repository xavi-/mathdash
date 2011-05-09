function(doc, req) {
    var field = req.query.field, value = req.query.value;
    doc[field] = value;
    return [ doc, "Updated: " + field + " = " + value ];
}