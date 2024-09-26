--!strict
local _trace=require('@lib/citronella')._register('test.lua');local a = _trace(2,11,{})(1e+500)
local b = _trace(3,11,{a=a})(a)
local function f(x)
	_trace(5,2,{a=a,b=b,f=f})(print(_trace(5,34,{a=a,b=b,f=f})(b)))
	return x
end
_trace(8,1,{a=a,b=b,f=f})(f(_trace(8,29,{a=a,b=b,f=f})('Δ'))) _trace(8,64,{a=a,b=b,f=f})(print(_trace(8,97,{a=a,b=b,f=f})('Hello, world!')))
