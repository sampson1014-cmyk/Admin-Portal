const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id, {textContent:'',innerHTML:'',value:''}); return nodes.get(id); };
const context = vm.createContext({document:{addEventListener(){},getElementById:node,querySelectorAll(){return []}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../AdminGroupAssignment/wwwroot/js/feedback.js'),'utf8'),context);
let checks=0;
for(const raw of [undefined,null,'',' ','string','NaN','Infinity',true,{},0,-1,6,30,Infinity]) {
    context.sample={Rating:raw}; assert.equal(vm.runInContext('feedbackRating(sample)',context),null); checks++;
}
for(const raw of [1,5,4.5,'4',' 3.5 ']) { context.sample={Rating:raw};assert.equal(vm.runInContext('feedbackRating(sample)',context),Number(raw));checks++; }
assert.equal(vm.runInContext('feedbackRating({rating:"2"})',context),2);checks++;
assert.equal(vm.runInContext('feedbackRatingLabel(null)',context),'Not rated');checks++;
assert.equal(vm.runInContext('ratingStars(NaN)',context).match(/bi-star"/g).length,5);checks++;
context.samples=[{Id:1,Rating:4},{Id:2,Rating:5},{Id:3,Rating:30},{Id:4,Rating:'string'},{Id:5}];
vm.runInContext('feedbackRows=samples;updateFeedbackSummary()',context);
assert.equal(node('feedbackAverage').textContent,'4.5');checks++;
assert.equal(node('feedbackRatingCount').textContent,'2');checks++;
assert.equal(node('feedbackFiveStar').textContent,'1');checks++;
node('feedbackSort').value='rating-asc';assert.deepEqual(Array.from(vm.runInContext('visibleFeedback().map(x=>x.row.Id)',context)),[1,2,3,4,5]);checks++;
node('feedbackSort').value='rating-desc';assert.deepEqual(Array.from(vm.runInContext('visibleFeedback().map(x=>x.row.Id)',context)),[2,1,3,4,5]);checks++;
vm.runInContext('renderFeedback()',context);assert.ok(node('feedbackTableBody').innerHTML.includes('Not rated'));checks++;
assert.ok(!node('feedbackTableBody').innerHTML.includes('NaN'));checks++;
node('feedbackRating').value='5';assert.deepEqual(Array.from(vm.runInContext('visibleFeedback().map(x=>x.row.Id)',context)),[2]);checks++;
console.log(`${checks} feedback rating checks passed. No API writes.`);
