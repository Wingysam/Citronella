--!strict
local Tracey = {}
Tracey._breakpoints = {}

local function callCallbacks(id)
	local callbacks = Tracey._breakpoints[id]
	if callbacks == nil then
		return
	end
	for callback in callbacks do
		callback()
	end
end

function Tracey._register(sourceFile)
	return function(line) -- could also fetch the line by parsing debug.traceback but that's evil
		callCallbacks(`{sourceFile}:{line}`)
		callCallbacks(`{sourceFile}:*`)
		callCallbacks('*')
	end
end

function Tracey.hook(target, callback)
	if Tracey._breakpoints[target] == nil then
		Tracey._breakpoints[target] = {}
	end
	Tracey._breakpoints[target][callback] = true

	local Hook = {}

	function Hook.remove()
		Tracey._breakpoints[target][callback] = nil
	end

	return Hook
end

return Tracey
