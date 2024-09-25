--!strict
local _trace=require('@lib/citronella')._register('test.lua');local a = _trace(1,10,{})('b')
local b = _trace(2,10,{a=a})(a)
local function f()
	_trace(4,1,{a=a,b=b,f=f})(print(_trace(4,33,{a=a,b=b,f=f})(b)))
end
_trace(6,0,{a=a,b=b,f=f})(f())
