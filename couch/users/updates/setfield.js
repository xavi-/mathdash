function(doc, req) {
    var fields = JSON.parse(req.query.fields);
    
    for(var field in fields) {
        doc[field] = fields[field];
    }
    return [ doc, JSON.stringify({ "fields": fields }) ];
}