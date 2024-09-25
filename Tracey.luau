--!strict
local Citronella = {}
Citronella._breakpoints = {}

local function callCallbacks(id)
	local callbacks = Citronella._breakpoints[id]
	if callbacks == nil then
		return
	end
	for callback in callbacks do
		callback()
	end
end

function Citronella._register(sourceFile)
	return function(line) -- could also fetch the line by parsing debug.traceback but that's evil
		callCallbacks(`{sourceFile}:{line}`)
		callCallbacks(`{sourceFile}:*`)
		callCallbacks('*')
	end
end

function Citronella.hook(target, callback)
	if Citronella._breakpoints[target] == nil then
		Citronella._breakpoints[target] = {}
	end
	Citronella._breakpoints[target][callback] = true

	local Hook = {}

	function Hook.remove()
		Citronella._breakpoints[target][callback] = nil
	end

	return Hook
end

return Citronella
